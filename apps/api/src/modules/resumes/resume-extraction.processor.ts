import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import type { ResumeKind } from '@jarvis/shared';
import { PrismaService } from '../../common/prisma.service.js';
import { StorageService } from '../../common/storage.service.js';
import { QUEUES, type ResumeExtractJob } from '../../queues/queues.js';
import { ActivityService } from '../activity/activity.service.js';
import { TasksService } from '../activity/tasks.service.js';
import { extractText, withTimeout } from './text-extractor.js';

const EXTRACTION_TIMEOUT_MS = 60_000;
/** Abaixo disso o PDF provavelmente é imagem escaneada (OCR ainda não implementado). */
const LOW_TEXT_THRESHOLD = 200;

export interface ResumeExtractResult {
  status: 'extracted' | 'skipped';
  charCount?: number;
  pageCount?: number | null;
}

/** Roda apenas no entrypoint worker (src/worker.ts), nunca no processo HTTP. */
@Processor(QUEUES.resume, { concurrency: 2 })
export class ResumeExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(ResumeExtractionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly activity: ActivityService,
    private readonly tasks: TasksService,
  ) {
    super();
  }

  async process(job: Job<ResumeExtractJob>): Promise<ResumeExtractResult> {
    const { userId, resumeId, taskId } = job.data;
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;

    const resume = await this.prisma.resume.findFirst({ where: { id: resumeId, userId } });
    if (!resume) {
      // Conta ou currículo excluído depois do enfileiramento: nada a fazer.
      return { status: 'skipped' };
    }

    await this.tasks.markRunning(taskId, attempt);
    await this.prisma.resume.update({ where: { id: resumeId }, data: { status: 'PROCESSING' } });
    await this.activity.setState(userId, 'analyzing', `Lendo ${resume.originalName}`);

    try {
      const buffer = await this.storage.get(resume.storageKey);
      const { text, pageCount } = await withTimeout(
        extractText(buffer, resume.kind as ResumeKind),
        EXTRACTION_TIMEOUT_MS,
        'Extração de texto',
      ).catch((err: Error) => {
        // Arquivo corrompido não melhora com nova tentativa.
        if (/Invalid PDF|corrupt|end of central directory/i.test(err.message)) {
          throw new UnrecoverableError(`Documento ilegível: ${err.message}`);
        }
        throw err;
      });

      await this.prisma.resume.update({
        where: { id: resumeId },
        data: {
          status: 'EXTRACTED',
          extractedText: text,
          pageCount,
          charCount: text.length,
          errorMessage: null,
          extractedAt: new Date(),
        },
      });

      const pages = pageCount ? `${pageCount} página(s), ` : '';
      await this.activity.record(userId, {
        type: 'resume.extracted',
        level: 'success',
        title: `Currículo lido: ${resume.originalName}`,
        detail: `${pages}${text.length.toLocaleString('pt-BR')} caracteres extraídos.`,
        subject: `resume:${resumeId}`,
        taskId,
      });
      if (text.length < LOW_TEXT_THRESHOLD) {
        await this.activity.record(userId, {
          type: 'resume.low_text',
          level: 'warning',
          title: 'Pouco texto encontrado no currículo',
          detail:
            resume.kind === 'pdf'
              ? 'O PDF pode ser uma imagem escaneada. A leitura por OCR ainda não está disponível; envie um PDF com texto selecionável ou um DOCX.'
              : 'O documento tem muito pouco conteúdo para uma análise útil. Verifique se é o currículo completo.',
          subject: `resume:${resumeId}`,
          taskId,
        });
      }
      await this.tasks.markSucceeded(taskId);
      await this.activity.setState(userId, 'completed', 'Leitura do currículo concluída');
      return { status: 'extracted', charCount: text.length, pageCount };
    } catch (err) {
      const message = (err as Error).message;
      const final = err instanceof UnrecoverableError || attempt >= maxAttempts;
      this.logger.warn(`Extração ${resumeId} falhou (tentativa ${attempt}/${maxAttempts}): ${message}`);

      if (final) {
        await this.prisma.resume.update({
          where: { id: resumeId },
          data: { status: 'FAILED', errorMessage: message.slice(0, 500) },
        });
        await this.tasks.markFailed(taskId, message);
        await this.activity.record(userId, {
          type: 'resume.extract_failed',
          level: 'error',
          title: `Não consegui ler ${resume.originalName}`,
          detail: message.slice(0, 500),
          subject: `resume:${resumeId}`,
          taskId,
        });
        await this.activity.setState(userId, 'error', 'Falha ao ler o currículo');
      }
      throw err;
    }
  }
}
