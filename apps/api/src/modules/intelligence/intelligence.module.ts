import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DEFAULT_JOB_OPTIONS, QUEUES } from '../../queues/queues.js';
import { ActivityCoreModule, ActivityModule } from '../activity/activity.module.js';
import { JobsQueueModule } from '../jobs/jobs-queue.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { ResumeAnalysisProcessor } from './analysis/resume-analysis.processor.js';
import { ResumeAnalysisService } from './analysis/resume-analysis.service.js';
import { ChatService } from './chat/chat.service.js';
import { ConversationsController } from './chat/conversations.controller.js';
import { ConversationsService } from './chat/conversations.service.js';
import { IntelligenceController } from './intelligence.controller.js';
import { LlmModule } from './llm/llm.module.js';
import { ActionRouter } from './tools/action-router.js';
import { CareerToolsService } from './tools/career-tools.service.js';

const analysisQueue = BullModule.registerQueue({ name: QUEUES.analysis, defaultJobOptions: DEFAULT_JOB_OPTIONS });

/** JARVIS Intelligence Core — HTTP: conversa, ferramentas e solicitação de análises. */
@Module({
  imports: [analysisQueue, LlmModule, ActivityModule, ProfileModule, JobsModule, JobsQueueModule],
  controllers: [ConversationsController, IntelligenceController],
  providers: [CareerToolsService, ActionRouter, ConversationsService, ChatService, ResumeAnalysisService],
})
export class IntelligenceModule {}

/** Worker: executa as análises de currículo com o modelo. */
@Module({
  imports: [analysisQueue, LlmModule, ActivityCoreModule],
  providers: [ResumeAnalysisProcessor],
})
export class IntelligenceWorkerModule {}
