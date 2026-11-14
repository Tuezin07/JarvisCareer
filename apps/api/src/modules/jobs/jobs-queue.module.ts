import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DEFAULT_JOB_OPTIONS, QUEUES } from '../../queues/queues.js';
import { JobsQueueService } from './jobs-queue.service.js';

const researchQueue = BullModule.registerQueue({ name: QUEUES.research, defaultJobOptions: DEFAULT_JOB_OPTIONS });

@Module({
  imports: [researchQueue],
  providers: [JobsQueueService],
  exports: [JobsQueueService, researchQueue],
})
export class JobsQueueModule {}
