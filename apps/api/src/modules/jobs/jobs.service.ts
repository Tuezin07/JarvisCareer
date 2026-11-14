import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  FraudSignal,
  JobDetailDto,
  JobListItemDto,
  JobMatchStatus,
  JobsListResponse,
  JobsQuery,
  JobSourceDto,
  MatchBreakdown,
} from '@jarvis/shared';
import { AuditService, type RequestMeta } from '../../common/audit.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { JobListing, JobMatch, JobSource, Prisma } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { ConnectorRegistry } from './connectors/connectors.registry.js';
import { parseJobUrl } from './connectors/source-url.js';
import { BoardNotFoundError } from './connectors/types.js';
import { JobsQueueService } from './jobs-queue.service.js';

export const MAX_SOURCES_PER_USER = 30;

export const toSourceDto = (s: JobSource): JobSourceDto => ({
  id: s.id,
  provider: s.provider,
  boardToken: s.boardToken,
  companyName: s.companyName,
  careersUrl: s.careersUrl,
  status: s.status,
  openJobCount: s.openJobCount,
  lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
  lastError: s.lastError,
});

type ListingWithSource = JobListing & { source: Pick<JobSource, 'provider'> };

function topReasons(b: MatchBreakdown | null): string[] {
  if (!b?.criteria) return [];
  if (b.eliminatedReasons?.length) return b.eliminatedReasons.slice(0, 2);
  const skills = b.criteria.find((c) => c.key === 'skills');
  return [skills?.detail, b.met?.[0], b.unmet?.[0]].filter((x): x is string => !!x).slice(0, 3);
}

function toItem(m: JobMatch, l: ListingWithSource): JobListItemDto {
  return {
    id: l.id,
    title: l.title,
    companyName: l.companyName,
    provider: l.source.provider,
    locations: l.locations,
    workplaceType: l.workplaceType,
    employmentType: l.employmentType,
    url: l.url,
    publishedAt: l.publishedAt?.toISOString() ?? null,
    closed: l.closedAt !== null,
    fraudRisk: l.fraudRisk,
    score: m.score,
    eliminated: m.eliminated,
    status: m.status,
    topReasons: topReasons(m.breakdown as unknown as MatchBreakdown),
  };
}

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorRegistry,
    private readonly queue: JobsQueueService,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
  ) {}

  async sources(userId: string): Promise<JobSourceDto[]> {
    const rows = await this.prisma.userJobSource.findMany({ where: { userId }, include: { source: true }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => toSourceDto(r.source));
  }

  /** Acompanha a página de vagas de uma empresa a partir do link público. */
  async follow(userId: string, url: string, meta?: RequestMeta): Promise<JobSourceDto> {
    const ref = parseJobUrl(url);
    if (!ref) {
      throw new BadRequestException(
        'Link não reconhecido. Use a página de vagas da empresa no Greenhouse, Lever ou Ashby (ex.: https://job-boards.greenhouse.io/empresa).',
      );
    }
    const count = await this.prisma.userJobSource.count({ where: { userId } });
    if (count >= MAX_SOURCES_PER_USER) throw new ConflictException(`Limite de ${MAX_SOURCES_PER_USER} empresas acompanhadas.`);

    let source = await this.prisma.jobSource.findUnique({
      where: { provider_boardToken: { provider: ref.provider, boardToken: ref.boardToken } },
    });
    if (!source) {
      const info = await this.connectors
        .get(ref.provider)
        .board(ref)
        .catch((err: Error) => {
          if (err instanceof BoardNotFoundError) throw new BadRequestException('Essa página de vagas não existe ou não é pública.');
          throw err;
        });
      source = await this.prisma.jobSource.create({
        data: { provider: ref.provider, boardToken: ref.boardToken, region: ref.region, companyName: info.companyName, careersUrl: info.careersUrl },
      });
    } else if (source.status === 'DISABLED') {
      source = await this.prisma.jobSource.update({ where: { id: source.id }, data: { status: 'ACTIVE', consecutiveFailures: 0 } });
    }

    const already = await this.prisma.userJobSource.findUnique({ where: { userId_sourceId: { userId, sourceId: source.id } } });
    if (!already) {
      await this.prisma.userJobSource.create({ data: { userId, sourceId: source.id } });
      await this.audit.log('jobs.source.follow', { userId, meta, metadata: { sourceId: source.id, provider: source.provider } });
      await this.activity.record(userId, {
        type: 'jobs.source_followed',
        title: `Acompanhando as vagas da ${source.companyName}`,
        detail: `Página pública no ${source.provider.toLowerCase()}. Vou ler as vagas agora e a cada 6 horas.`,
        subject: `source:${source.id}`,
      });
    }
    await this.queue.schedule(source.id);
    await this.queue.enqueueSync({ sourceId: source.id });
    // Empresa já lida antes: as vagas existem, calcula para quem acabou de entrar sem esperar a leitura.
    if (source.lastSyncedAt) await this.queue.enqueueMatch(userId);
    return toSourceDto(source);
  }

  async unfollow(userId: string, sourceId: string, meta?: RequestMeta): Promise<void> {
    const link = await this.prisma.userJobSource.findUnique({ where: { userId_sourceId: { userId, sourceId } }, include: { source: true } });
    if (!link) throw new NotFoundException('Empresa não acompanhada');
    await this.prisma.userJobSource.delete({ where: { userId_sourceId: { userId, sourceId } } });
    // Vagas da empresa saem da lista, exceto as que o candidato salvou.
    await this.prisma.jobMatch.deleteMany({ where: { userId, status: { not: 'SAVED' }, listing: { sourceId } } });
    const remaining = await this.prisma.userJobSource.count({ where: { sourceId } });
    if (remaining === 0) await this.queue.unschedule(sourceId);
    await this.audit.log('jobs.source.unfollow', { userId, meta, metadata: { sourceId } });
    await this.activity.record(userId, { type: 'jobs.source_unfollowed', title: `Deixei de acompanhar a ${link.source.companyName}` });
  }

  async syncNow(userId: string, sourceId: string): Promise<void> {
    const link = await this.prisma.userJobSource.findUnique({ where: { userId_sourceId: { userId, sourceId } } });
    if (!link) throw new NotFoundException('Empresa não acompanhada');
    await this.queue.enqueueSync({ sourceId });
  }

  /** Importa uma vaga específica pelo link, sem acompanhar a empresa toda. */
  async importJob(userId: string, url: string): Promise<{ status: 'QUEUED' }> {
    const ref = parseJobUrl(url);
    if (!ref?.externalId) {
      throw new BadRequestException('Link de vaga não reconhecido. Cole o link de uma vaga específica no Greenhouse, Lever ou Ashby.');
    }
    let source = await this.prisma.jobSource.findUnique({
      where: { provider_boardToken: { provider: ref.provider, boardToken: ref.boardToken } },
    });
    if (!source) {
      const info = await this.connectors
        .get(ref.provider)
        .board(ref)
        .catch((err: Error) => {
          if (err instanceof BoardNotFoundError) throw new BadRequestException('Essa página de vagas não existe ou não é pública.');
          throw err;
        });
      source = await this.prisma.jobSource.create({
        data: { provider: ref.provider, boardToken: ref.boardToken, region: ref.region, companyName: info.companyName, careersUrl: info.careersUrl },
      });
    }
    await this.queue.enqueueSync({ sourceId: source.id, importForUser: { userId, externalId: ref.externalId } });
    return { status: 'QUEUED' };
  }

  async list(userId: string, q: JobsQuery): Promise<JobsListResponse> {
    const where: Prisma.JobMatchWhereInput = {
      userId,
      score: { gte: q.minScore },
      ...(q.includeEliminated ? {} : { eliminated: false }),
      ...(q.status ? { status: q.status } : { status: { not: 'DISMISSED' } }),
      listing: {
        closedAt: null,
        ...(q.q && {
          OR: [
            { title: { contains: q.q, mode: 'insensitive' } },
            { companyName: { contains: q.q, mode: 'insensitive' } },
            { description: { contains: q.q, mode: 'insensitive' } },
          ],
        }),
      },
    };
    const [total, rows] = await Promise.all([
      this.prisma.jobMatch.count({ where }),
      this.prisma.jobMatch.findMany({
        where,
        orderBy: [{ score: 'desc' }, { computedAt: 'desc' }],
        skip: q.offset,
        take: q.limit,
        include: { listing: { include: { source: { select: { provider: true } } } } },
      }),
    ]);
    return { total, items: rows.map((m) => toItem(m, m.listing)) };
  }

  /** Detalhe só existe para o candidato que tem a vaga na lista (404 para os demais). */
  async detail(userId: string, listingId: string): Promise<JobDetailDto> {
    const m = await this.prisma.jobMatch.findUnique({
      where: { userId_listingId: { userId, listingId } },
      include: { listing: { include: { source: { select: { provider: true } } } } },
    });
    if (!m) throw new NotFoundException('Vaga não encontrada');
    const l = m.listing;
    return {
      ...toItem(m, l),
      department: l.department,
      description: l.description,
      applyUrl: l.applyUrl,
      salary: l.salaryMin != null || l.salaryMax != null ? { min: l.salaryMin, max: l.salaryMax, currency: l.salaryCurrency, period: l.salaryPeriod } : null,
      fraudSignals: l.fraudSignals as unknown as FraudSignal[],
      breakdown: m.breakdown as unknown as MatchBreakdown,
    };
  }

  async setStatus(userId: string, listingId: string, status: JobMatchStatus): Promise<JobDetailDto> {
    const res = await this.prisma.jobMatch.updateMany({ where: { userId, listingId }, data: { status } });
    if (res.count === 0) throw new NotFoundException('Vaga não encontrada');
    return this.detail(userId, listingId);
  }

  countOpenMatches(userId: string): Promise<number> {
    return this.prisma.jobMatch.count({ where: { userId, eliminated: false, status: { not: 'DISMISSED' }, listing: { closedAt: null } } });
  }
}
