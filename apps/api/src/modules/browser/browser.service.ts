import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type {
  AutomationProfile,
  AutomationTask,
  Blocker,
  BrowserCapabilitiesDto,
  BrowserSessionDto,
  BrowserStep,
  BrowserTaskKind,
  FieldMapping,
  FormField,
} from '@jarvis/shared';
import { AuditService, type RequestMeta } from '../../common/audit.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { RedisService } from '../../common/redis.service.js';
import { StorageService } from '../../common/storage.service.js';
import { ENV, type Env } from '../../config/env.js';
import type { ActionEvidence, BrowserSession } from '../../generated/prisma/client.js';
import { automationCancelKey, QUEUES } from '../../queues/queues.js';
import { ActivityService } from '../activity/activity.service.js';

export const BROWSER_DAILY_LIMIT = 20;
const DAY_MS = 24 * 3600 * 1000;

/** Hosts oficiais de cada ATS: a página principal só navega dentro deles. */
const PROVIDER_HOSTS: Record<string, string[]> = {
  GREENHOUSE: ['greenhouse.io'],
  LEVER: ['lever.co'],
  ASHBY: ['ashbyhq.com'],
};

export interface StoredBrowserResult {
  steps: BrowserStep[];
  fields: FormField[];
  mapping: FieldMapping[];
  blockers: Blocker[];
  blockedRequests: string[];
}

export function toSessionDto(s: BrowserSession & { evidence: ActionEvidence[] }, screenshotsConsent: boolean): BrowserSessionDto {
  const r = (s.result as StoredBrowserResult | null) ?? { steps: [], fields: [], mapping: [], blockers: [], blockedRequests: [] };
  return {
    id: s.id,
    kind: s.kind,
    status: s.status,
    targetUrl: s.targetUrl,
    finalUrl: s.finalUrl,
    title: s.title,
    listingId: s.listingId,
    provider: s.provider,
    steps: r.steps,
    fields: r.fields,
    mapping: r.mapping,
    blockers: r.blockers,
    blockedRequests: r.blockedRequests,
    evidence: s.evidence
      .filter((e) => e.expiresAt > new Date())
      .map((e) => ({
        id: e.id,
        label: e.label,
        url: `/browser/sessions/${s.id}/evidence/${e.id}`,
        createdAt: e.createdAt.toISOString(),
        expiresAt: e.expiresAt.toISOString(),
      })),
    screenshotsConsent,
    error: s.error,
    createdAt: s.createdAt.toISOString(),
    startedAt: s.startedAt?.toISOString() ?? null,
    finishedAt: s.finishedAt?.toISOString() ?? null,
  };
}

/**
 * JARVIS WEB no control plane: valida, registra e enfileira tarefas para o executor
 * isolado. Este processo nunca abre navegador.
 */
@Injectable()
export class BrowserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
    @InjectQueue(QUEUES.automation) private readonly queue: Queue<AutomationTask>,
  ) {}

  async screenshotsConsent(userId: string): Promise<boolean> {
    const c = await this.prisma.consent.findFirst({ where: { userId, type: 'EVIDENCE_SCREENSHOTS' }, orderBy: { createdAt: 'desc' } });
    return c?.granted ?? false;
  }

  private usedToday(userId: string) {
    return this.prisma.browserSession.count({ where: { userId, createdAt: { gte: new Date(Date.now() - DAY_MS) } } });
  }

  async capabilities(userId: string): Promise<BrowserCapabilitiesDto> {
    return {
      testSiteUrl: this.env.AUTOMATION_TEST_SITE_URL ? `${this.env.AUTOMATION_TEST_SITE_URL}/vagas/42/aplicar` : null,
      screenshotsConsent: await this.screenshotsConsent(userId),
      dailyLimit: BROWSER_DAILY_LIMIT,
      usedToday: await this.usedToday(userId),
    };
  }

  /** Abre a página de candidatura da vaga para descrever o formulário. Só leitura. */
  async inspectJob(userId: string, listingId: string, meta?: RequestMeta): Promise<BrowserSessionDto> {
    const match = await this.prisma.jobMatch.findUnique({
      where: { userId_listingId: { userId, listingId } },
      include: { listing: { include: { source: { select: { provider: true } } } } },
    });
    if (!match) throw new NotFoundException('Vaga não encontrada');
    const l = match.listing;
    const target = new URL(l.applyUrl ?? l.url);
    if (target.protocol !== 'https:') throw new BadRequestException('A página da vaga não usa HTTPS.');
    const allowlist = [...new Set([...(PROVIDER_HOSTS[l.source.provider] ?? []), target.hostname])];

    const profile = await this.profileFor(userId);
    // Minimização: na inspeção o executor só precisa saber se o dado existe, não o valor.
    const presence = Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, v ? '[presente]' : null])) as AutomationProfile;
    const resume = await this.prisma.resume.findFirst({ where: { userId, isPrimary: true }, select: { id: true } });

    return this.create(userId, 'INSPECT_PAGE', target.toString(), allowlist, { profile: presence, hasResume: !!resume, listingId, meta, title: `${l.title} · ${l.companyName}` });
  }

  /** Preenche o formulário do site de testes controlado com dados reais do perfil, sem enviar. */
  async fillTestForm(userId: string, meta?: RequestMeta): Promise<BrowserSessionDto> {
    const base = this.env.AUTOMATION_TEST_SITE_URL;
    if (!base) throw new NotFoundException('O site de testes não está habilitado neste ambiente.');
    const target = `${base}/vagas/42/aplicar`;
    const resume = await this.prisma.resume.findFirst({ where: { userId, isPrimary: true } });
    const resumePayload = resume
      ? { fileName: resume.originalName, mimeType: resume.mimeType, base64: (await this.storage.get(resume.storageKey)).toString('base64') }
      : undefined;
    return this.create(userId, 'FILL_TEST_FORM', target, [new URL(target).hostname], {
      profile: await this.profileFor(userId),
      resume: resumePayload,
      meta,
      title: 'Formulário de testes · Empresa Exemplo',
    });
  }

  private async create(
    userId: string,
    kind: BrowserTaskKind,
    targetUrl: string,
    navigationAllowlist: string[],
    opts: { profile: AutomationProfile; resume?: AutomationTask['resume']; hasResume?: boolean; listingId?: string; meta?: RequestMeta; title: string },
  ): Promise<BrowserSessionDto> {
    const prefs = await this.prisma.candidatePreferences.findUnique({ where: { userId }, select: { searchPaused: true } });
    if (prefs?.searchPaused) throw new ConflictException('As operações estão pausadas. Retome antes de usar o navegador.');
    const active = await this.prisma.browserSession.count({ where: { userId, status: { in: ['QUEUED', 'RUNNING'] } } });
    if (active > 0) throw new ConflictException('Já existe uma sessão de navegador em andamento. Aguarde ou cancele.');
    if ((await this.usedToday(userId)) >= BROWSER_DAILY_LIMIT) {
      throw new HttpException(`Limite de ${BROWSER_DAILY_LIMIT} sessões de navegador em 24 horas atingido.`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const captureScreenshots = await this.screenshotsConsent(userId);
    const session = await this.prisma.browserSession.create({
      data: { userId, kind, targetUrl, listingId: opts.listingId ?? null, title: opts.title },
      include: { evidence: true },
    });
    const resume =
      opts.resume ?? (opts.hasResume ? { fileName: '[currículo principal]', mimeType: 'application/octet-stream', base64: '' } : undefined);
    const task: AutomationTask = {
      version: 1,
      sessionId: session.id,
      userId,
      kind,
      targetUrl,
      navigationAllowlist,
      captureScreenshots,
      profile: opts.profile,
      resume,
      limits: { timeoutMs: 90_000, maxSteps: 30 },
    };
    // A tarefa sai da fila ao terminar: dados do perfil não ficam no Redis.
    await this.queue.add(kind, task, { jobId: session.id, attempts: 1, removeOnComplete: true, removeOnFail: true });

    await this.audit.log('browser.session.create', { userId, meta: opts.meta, metadata: { sessionId: session.id, kind, host: new URL(targetUrl).host } });
    await this.activity.record(userId, {
      type: 'browser.session_created',
      title: kind === 'INSPECT_PAGE' ? `Abrindo a página de candidatura: ${opts.title}` : 'Preenchendo o formulário de testes',
      detail: `Navegador isolado, só ${navigationAllowlist.join(', ')}. ${captureScreenshots ? 'Com capturas de tela de evidência.' : 'Sem capturas de tela (você não autorizou).'}`,
      subject: `browser:${session.id}`,
    });
    return toSessionDto(session, captureScreenshots);
  }

  async list(userId: string): Promise<BrowserSessionDto[]> {
    const [rows, consent] = await Promise.all([
      this.prisma.browserSession.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30, include: { evidence: true } }),
      this.screenshotsConsent(userId),
    ]);
    return rows.map((r) => toSessionDto(r, consent));
  }

  async get(userId: string, id: string): Promise<BrowserSessionDto> {
    const s = await this.prisma.browserSession.findFirst({ where: { id, userId }, include: { evidence: true } });
    if (!s) throw new NotFoundException('Sessão não encontrada');
    return toSessionDto(s, await this.screenshotsConsent(userId));
  }

  async evidenceFile(userId: string, sessionId: string, evidenceId: string): Promise<{ data: Buffer; mimeType: string }> {
    const e = await this.prisma.actionEvidence.findFirst({ where: { id: evidenceId, sessionId, userId, expiresAt: { gt: new Date() } } });
    if (!e) throw new NotFoundException('Evidência não encontrada ou expirada');
    return { data: await this.storage.get(e.storageKey), mimeType: e.mimeType };
  }

  /** Parada imediata: na fila, sai da fila; em execução, o executor para no próximo passo. */
  async cancel(userId: string, id: string, meta?: RequestMeta): Promise<BrowserSessionDto> {
    const s = await this.prisma.browserSession.findFirst({ where: { id, userId } });
    if (!s) throw new NotFoundException('Sessão não encontrada');
    if (s.status === 'QUEUED' || s.status === 'RUNNING') await this.stop(s);
    await this.audit.log('browser.session.cancel', { userId, meta, metadata: { sessionId: id } });
    return this.get(userId, id);
  }

  /** Pausa global: interrompe tudo o que estiver em andamento. */
  async cancelAllForUser(userId: string): Promise<number> {
    const active = await this.prisma.browserSession.findMany({ where: { userId, status: { in: ['QUEUED', 'RUNNING'] } } });
    for (const s of active) await this.stop(s);
    return active.length;
  }

  private async stop(s: BrowserSession) {
    await this.redis.client.set(automationCancelKey(s.id), '1', 'EX', 3600);
    const job = await this.queue.getJob(s.id);
    if (job && (await job.isWaiting())) {
      await job.remove();
      await this.prisma.browserSession.update({ where: { id: s.id }, data: { status: 'CANCELLED', finishedAt: new Date() } });
      await this.activity.record(s.userId, { type: 'browser.session_cancelled', title: 'Sessão de navegador cancelada antes de começar', subject: `browser:${s.id}` });
    }
  }

  private async profileFor(userId: string): Promise<AutomationProfile> {
    const [profile, user] = await Promise.all([
      this.prisma.candidateProfile.findUnique({ where: { userId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
    ]);
    const fullName = profile?.fullName?.trim() ?? '';
    const [firstName, ...rest] = fullName.split(/\s+/);
    return {
      fullName,
      firstName: firstName ?? '',
      lastName: rest.join(' '),
      email: user.email,
      phone: profile?.phone ?? null,
      city: profile?.city ?? null,
      state: profile?.state ?? null,
    };
  }
}
