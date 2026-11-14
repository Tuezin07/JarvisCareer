import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { type MatchUserJob, QUEUES, type ResearchJob, SOURCE_SYNC_EVERY_MS, type SourceSyncJob, sourceSchedulerId } from '../../queues/queues.js';

/** Único ponto que enfileira trabalho de pesquisa, usado por perfil, ferramentas e API de vagas. */
@Injectable()
export class JobsQueueService {
  constructor(@InjectQueue(QUEUES.research) private readonly queue: Queue<ResearchJob>) {}

  /** Recalcula a compatibilidade do candidato. Rajadas viram no máximo uma execução + uma pendente. */
  enqueueMatch(userId: string) {
    return this.queue.add('match.user', { userId } satisfies MatchUserJob, {
      deduplication: { id: `match-user-${userId}`, keepLastIfActive: true },
    });
  }

  /** Sincroniza agora (deduplicado por fonte enquanto um sync estiver pendente). */
  enqueueSync(data: SourceSyncJob) {
    return this.queue.add('source.sync', data, {
      // Sem ttl: só bloqueia duplicata enquanto a leitura anterior está na fila ou rodando.
      deduplication: data.importForUser ? undefined : { id: `source-sync-now-${data.sourceId}` },
    });
  }

  schedule(sourceId: string) {
    return this.queue.upsertJobScheduler(
      sourceSchedulerId(sourceId),
      { every: SOURCE_SYNC_EVERY_MS },
      { name: 'source.sync', data: { sourceId } satisfies SourceSyncJob },
    );
  }

  unschedule(sourceId: string) {
    return this.queue.removeJobScheduler(sourceSchedulerId(sourceId));
  }
}
