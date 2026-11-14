import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { type MatchUserJob, QUEUES, type ResearchJob, type SourceSyncJob } from '../../queues/queues.js';
import { ActivityService } from '../activity/activity.service.js';
import { BoardNotFoundError } from './connectors/types.js';
import { MatchingService } from './matching/matching.service.js';
import { SyncService } from './sync.service.js';

/** Worker da fila research: leitura de páginas de vagas e recálculo de compatibilidade. */
@Processor(QUEUES.research, { concurrency: 2 })
export class ResearchProcessor extends WorkerHost {
  private readonly logger = new Logger(ResearchProcessor.name);

  constructor(
    private readonly sync: SyncService,
    private readonly matching: MatchingService,
    private readonly activity: ActivityService,
  ) {
    super();
  }

  async process(job: Job<ResearchJob>) {
    if (job.name === 'source.sync') {
      try {
        return await this.sync.sync(job.data as SourceSyncJob);
      } catch (err) {
        if (err instanceof BoardNotFoundError) throw new UnrecoverableError(err.message);
        throw err;
      }
    }
    if (job.name === 'match.user') {
      const { userId } = job.data as MatchUserJob;
      await this.activity.setState(userId, 'analyzing', 'Calculando compatibilidade com as vagas');
      const result = await this.matching.recomputeForUser(userId);
      await this.activity.setState(userId, 'completed', `Compatibilidade calculada para ${result.total} vaga(s)`);
      return result;
    }
    this.logger.warn(`Job desconhecido na fila research: ${job.name}`);
    return null;
  }
}
