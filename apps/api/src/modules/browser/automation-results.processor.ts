import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { automationResultSchema, type AutomationResult } from '@jarvis/shared';
import { PrismaService } from '../../common/prisma.service.js';
import { RedisService } from '../../common/redis.service.js';
import { StorageService } from '../../common/storage.service.js';
import { ENV, type Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { automationCancelKey, QUEUES } from '../../queues/queues.js';
import { ActivityService } from '../activity/activity.service.js';
import type { StoredBrowserResult } from './browser.service.js';

/**
 * Recebe o que o executor isolado devolveu e transforma em registro auditável:
 * status, passos, campos, bloqueios e capturas (só com consentimento, com prazo para expirar).
 */
@Processor(QUEUES.automationResults, { concurrency: 2 })
export class AutomationResultsProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationResultsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly redis: RedisService,
    private readonly activity: ActivityService,
    @Inject(ENV) private readonly env: Env,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name === 'started') {
      const { sessionId, userId, startedAt } = job.data as { sessionId: string; userId: string; startedAt: string };
      await this.prisma.browserSession.updateMany({ where: { id: sessionId, userId, status: 'QUEUED' }, data: { status: 'RUNNING', startedAt: new Date(startedAt) } });
      return;
    }
    const parsed = automationResultSchema.safeParse(job.data);
    if (!parsed.success) {
      this.logger.error(`Resultado inválido do executor: ${parsed.error.issues[0]?.message}`);
      return;
    }
    await this.persist(parsed.data);
  }

  private async persist(r: AutomationResult) {
    const session = await this.prisma.browserSession.findFirst({ where: { id: r.sessionId, userId: r.userId } });
    if (!session) return; // conta excluída enquanto a tarefa rodava

    // O consentimento é conferido de novo aqui: se foi revogado durante a execução, as capturas são descartadas.
    const consent = await this.prisma.consent.findFirst({ where: { userId: r.userId, type: 'EVIDENCE_SCREENSHOTS' }, orderBy: { createdAt: 'desc' } });
    const expiresAt = new Date(Date.now() + this.env.EVIDENCE_RETENTION_DAYS * 24 * 3600 * 1000);
    if (consent?.granted) {
      for (const [i, shot] of r.screenshots.entries()) {
        const data = Buffer.from(shot.base64, 'base64');
        const storageKey = `users/${r.userId}/evidence/${r.sessionId}/${i}.jpg`;
        await this.storage.put(storageKey, data).catch(() => undefined);
        await this.prisma.actionEvidence.upsert({
          where: { storageKey },
          create: { userId: r.userId, sessionId: r.sessionId, label: shot.label, storageKey, mimeType: shot.mimeType, sizeBytes: data.length, expiresAt },
          update: {},
        });
      }
    }

    const stored: StoredBrowserResult = { steps: r.steps, fields: r.fields, mapping: r.mapping, blockers: r.blockers, blockedRequests: r.blockedRequests };
    await this.prisma.browserSession.update({
      where: { id: r.sessionId },
      data: {
        status: r.status,
        finalUrl: r.finalUrl,
        title: session.title ?? r.title,
        provider: r.provider,
        executor: r.executor,
        result: stored as unknown as Prisma.InputJsonValue,
        error: r.error,
        startedAt: session.startedAt ?? new Date(r.startedAt),
        finishedAt: new Date(r.finishedAt),
      },
    });
    await this.redis.client.del(automationCancelKey(r.sessionId));
    await this.announce(r, session.title ?? r.title ?? 'página');
  }

  private async announce(r: AutomationResult, name: string) {
    const auto = r.mapping.filter((m) => m.status === 'AUTO').length;
    const human = r.mapping.filter((m) => m.required && m.status === 'NEEDS_HUMAN').length;
    const blockers = r.blockers.filter((b) => b.kind !== 'NAVIGATION_BLOCKED').map((b) => b.kind);
    const subject = `browser:${r.sessionId}`;
    const base = { type: `browser.session_${r.status.toLowerCase()}`, subject };

    switch (r.status) {
      case 'SUCCEEDED':
      case 'WAITING_HUMAN':
        await this.activity.record(r.userId, {
          ...base,
          level: blockers.length || human ? 'warning' : 'success',
          title:
            r.mapping.length === 0
              ? `Página aberta, mas sem formulário visível: ${name}`
              : r.steps.some((s) => s.action === 'fill')
                ? `Formulário de testes preenchido (nada foi enviado): ${name}`
                : `Formulário inspecionado: ${name}`,
          detail: [
            `${r.fields.length} campo(s): ${auto} preenchível(is) com seu perfil, ${human} obrigatório(s) precisam de você.`,
            blockers.length ? `A página exige ${blockers.join(' e ')}: essa parte é com você.` : null,
          ]
            .filter(Boolean)
            .join(' '),
        });
        await this.activity.setState(r.userId, human || blockers.length ? 'waiting_approval' : 'completed', human ? 'Aguardando suas respostas' : 'Navegador concluído');
        break;
      case 'BLOCKED':
        await this.activity.record(r.userId, { ...base, level: 'warning', title: `Navegação barrada pela política de segurança: ${name}`, detail: r.blockers[0]?.detail ?? r.error });
        await this.activity.setState(r.userId, 'completed', 'Navegação barrada pela política');
        break;
      case 'CANCELLED':
        await this.activity.record(r.userId, { ...base, title: `Sessão de navegador interrompida: ${name}` });
        await this.activity.setState(r.userId, 'completed', 'Navegador interrompido');
        break;
      default:
        await this.activity.record(r.userId, { ...base, level: 'error', title: `Falha no navegador: ${name}`, detail: r.error });
        await this.activity.setState(r.userId, 'error', 'Falha no navegador');
    }
  }
}
