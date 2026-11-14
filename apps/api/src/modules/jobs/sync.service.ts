import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service.js';
import { RedisService } from '../../common/redis.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { SourceSyncJob } from '../../queues/queues.js';
import { ActivityService } from '../activity/activity.service.js';
import { ConnectorRegistry } from './connectors/connectors.registry.js';
import { normalize } from './connectors/text.js';
import { BoardNotFoundError, type NormalizedJob } from './connectors/types.js';
import { JobsQueueService } from './jobs-queue.service.js';
import { detectFraudSignals } from './matching/fraud-signals.js';

/** Falhas seguidas até desligar a fonte (circuit breaker). */
export const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_DESCRIPTION = 30_000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function contentHash(j: NormalizedJob): string {
  return sha256(
    JSON.stringify([j.title, j.department, j.locations, j.workplaceType, j.employmentType, j.description, j.salary, j.applyUrl]),
  );
}

/** Mesma vaga publicada em lugares diferentes tende a ter empresa+cargo+local iguais. */
export function dedupKey(company: string, j: NormalizedJob): string {
  return sha256([normalize(company), normalize(j.title), normalize(j.locations[0] ?? '')].join('|'));
}

const LOCK_TTL_MS = 5 * 60_000;

export interface SyncResult {
  skipped?: 'NO_ACTIVE_FOLLOWERS' | 'DISABLED' | 'IN_PROGRESS';
  open?: number;
  created?: number;
  updated?: number;
  closed?: number;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: ConnectorRegistry,
    private readonly activity: ActivityService,
    private readonly queue: JobsQueueService,
    private readonly redis: RedisService,
  ) {}

  /** Uma leitura por empresa de cada vez (agendador e pedido manual podem coincidir). */
  async sync(job: SourceSyncJob): Promise<SyncResult> {
    const lockKey = `jarvis:sync-lock:${job.sourceId}`;
    if (!(await this.redis.client.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX'))) {
      // Importação não pode ser perdida: deixa o BullMQ tentar de novo em instantes.
      if (job.importForUser) throw new Error('Leitura da empresa em andamento; nova tentativa em seguida.');
      return { skipped: 'IN_PROGRESS' };
    }
    try {
      return await this.run(job);
    } finally {
      await this.redis.client.del(lockKey);
    }
  }

  private async run(job: SourceSyncJob): Promise<SyncResult> {
    const source = await this.prisma.jobSource.findUnique({
      where: { id: job.sourceId },
      include: { followers: { include: { user: { select: { preferences: { select: { searchPaused: true } } } } } } },
    });
    if (!source || source.status === 'DISABLED') return { skipped: 'DISABLED' };

    // Pausa do candidato é respeitada: só busca se alguém ativo precisa (ou se for importação pedida agora).
    const active = source.followers.filter((f) => !f.user.preferences?.searchPaused).map((f) => f.userId);
    if (active.length === 0 && !job.importForUser) return { skipped: 'NO_ACTIVE_FOLLOWERS' };
    const notify = job.importForUser ? [...new Set([...active, job.importForUser.userId])] : active;

    for (const userId of notify) await this.activity.setState(userId, 'researching', `Lendo vagas da ${source.companyName}`);

    let jobs: NormalizedJob[];
    try {
      jobs = await this.connectors.get(source.provider).jobs(source);
    } catch (err) {
      await this.registerFailure(source.id, source.companyName, notify, err as Error);
      throw err;
    }

    const now = new Date();
    const existing = await this.prisma.jobListing.findMany({
      where: { sourceId: source.id },
      select: { id: true, externalId: true, contentHash: true, closedAt: true },
    });
    const byExternal = new Map(existing.map((e) => [e.externalId, e]));
    let created = 0;
    let updated = 0;

    for (const j of jobs) {
      const hash = contentHash(j);
      const fraud = detectFraudSignals(j.title, j.description);
      const data = {
        title: j.title.slice(0, 300),
        companyName: source.companyName,
        department: j.department,
        locations: j.locations.slice(0, 20),
        workplaceType: j.workplaceType,
        employmentType: j.employmentType,
        description: j.description.slice(0, MAX_DESCRIPTION),
        url: j.url,
        applyUrl: j.applyUrl,
        language: j.language,
        salaryMin: j.salary?.min != null ? Math.round(j.salary.min) : null,
        salaryMax: j.salary?.max != null ? Math.round(j.salary.max) : null,
        salaryCurrency: j.salary?.currency ?? null,
        salaryPeriod: j.salary?.period ?? null,
        publishedAt: j.publishedAt && !Number.isNaN(j.publishedAt.getTime()) ? j.publishedAt : null,
        lastSeenAt: now,
        closedAt: null,
        contentHash: hash,
        dedupKey: dedupKey(source.companyName, j),
        fraudRisk: fraud.risk,
        fraudSignals: fraud.signals as unknown as Prisma.InputJsonValue,
      };
      const prev = byExternal.get(j.externalId);
      if (!prev) {
        await this.prisma.jobListing.create({ data: { sourceId: source.id, externalId: j.externalId, ...data } });
        created++;
      } else if (prev.contentHash !== hash || prev.closedAt) {
        await this.prisma.jobListing.update({ where: { id: prev.id }, data });
        updated++;
      } else {
        await this.prisma.jobListing.update({ where: { id: prev.id }, data: { lastSeenAt: now } });
      }
    }

    // Vaga que sumiu da página foi encerrada pela empresa: marca, não apaga (histórico e evidência).
    const seen = new Set(jobs.map((j) => j.externalId));
    const toClose = existing.filter((e) => !e.closedAt && !seen.has(e.externalId)).map((e) => e.id);
    if (toClose.length) await this.prisma.jobListing.updateMany({ where: { id: { in: toClose } }, data: { closedAt: now } });

    const firstSync = source.lastSyncedAt === null;
    await this.prisma.jobSource.update({
      where: { id: source.id },
      data: { status: 'ACTIVE', consecutiveFailures: 0, lastError: null, lastSyncedAt: now, openJobCount: jobs.length },
    });

    if (job.importForUser) {
      await this.attachImported(job.importForUser.userId, source.id, job.importForUser.externalId, source.companyName);
    }

    for (const userId of notify) {
      if (firstSync || created || toClose.length) {
        await this.activity.record(userId, {
          type: 'jobs.source_synced',
          title: `Vagas da ${source.companyName} atualizadas`,
          detail: `${jobs.length} aberta(s) · ${created} nova(s) · ${toClose.length} encerrada(s). Fonte: API pública oficial.`,
          subject: `source:${source.id}`,
        });
      }
      await this.queue.enqueueMatch(userId);
    }
    return { open: jobs.length, created, updated, closed: toClose.length };
  }

  /** Vaga importada por link: garante o vínculo com o candidato mesmo sem acompanhar a empresa. */
  private async attachImported(userId: string, sourceId: string, externalId: string, company: string) {
    const listing = await this.prisma.jobListing.findUnique({ where: { sourceId_externalId: { sourceId, externalId } } });
    if (!listing || listing.closedAt) {
      await this.activity.record(userId, {
        type: 'jobs.import_failed',
        level: 'warning',
        title: 'Não encontrei a vaga do link',
        detail: `A vaga não está mais publicada na página da ${company}.`,
      });
      return;
    }
    await this.prisma.jobMatch.upsert({
      where: { userId_listingId: { userId, listingId: listing.id } },
      create: { userId, listingId: listing.id, score: 0, breakdown: {}, listingHash: '0'.repeat(64) },
      update: {},
    });
    await this.activity.record(userId, {
      type: 'jobs.imported',
      level: 'success',
      title: `Vaga importada: ${listing.title}`,
      detail: `${company}. A compatibilidade será calculada em seguida.`,
      subject: `job:${listing.id}`,
    });
  }

  private async registerFailure(sourceId: string, company: string, followers: string[], err: Error) {
    const updated = await this.prisma.jobSource.update({
      where: { id: sourceId },
      data: { consecutiveFailures: { increment: 1 }, lastError: err.message.slice(0, 300), status: 'FAILING' },
    });
    const disable = err instanceof BoardNotFoundError || updated.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
    this.logger.warn(`Sync ${sourceId} falhou (${updated.consecutiveFailures}x): ${err.message}`);
    if (disable) {
      await this.prisma.jobSource.update({ where: { id: sourceId }, data: { status: 'DISABLED' } });
      await this.queue.unschedule(sourceId);
    }
    for (const userId of followers) {
      await this.activity.setState(userId, 'error', `Falha ao ler vagas da ${company}`);
      if (disable) {
        await this.activity.record(userId, {
          type: 'jobs.source_disabled',
          level: 'error',
          title: `Parei de acompanhar automaticamente a ${company}`,
          detail: err instanceof BoardNotFoundError ? 'A página de vagas não existe mais.' : `Falhas seguidas ao ler a página: ${err.message.slice(0, 150)}`,
        });
      }
    }
  }
}
