import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DEFAULT_JOB_OPTIONS, QUEUES } from '../../queues/queues.js';
import { ActivityCoreModule, ActivityModule } from '../activity/activity.module.js';
import { ResumeExtractionProcessor } from './resume-extraction.processor.js';
import { ResumesController } from './resumes.controller.js';
import { ResumesService } from './resumes.service.js';

const resumeQueue = BullModule.registerQueue({ name: QUEUES.resume, defaultJobOptions: DEFAULT_JOB_OPTIONS });

/** HTTP: recebe arquivos e enfileira. */
@Module({
  imports: [resumeQueue, ActivityModule],
  controllers: [ResumesController],
  providers: [ResumesService],
  exports: [ResumesService],
})
export class ResumesModule {}

/** Worker: processa a fila de extração. */
@Module({
  imports: [resumeQueue, ActivityCoreModule],
  providers: [ResumeExtractionProcessor],
})
export class ResumesWorkerModule {}
