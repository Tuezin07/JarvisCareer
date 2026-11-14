import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../queues/queues.js';
import { ActivityCoreModule, ActivityModule } from '../activity/activity.module.js';
import { AutomationResultsProcessor } from './automation-results.processor.js';
import { BrowserController } from './browser.controller.js';
import { BrowserService } from './browser.service.js';
import { EvidenceCleanupProcessor } from './evidence-cleanup.processor.js';

/** Sem retentativa automática: repetir uma ação em site externo é decisão do candidato. */
const automationQueue = BullModule.registerQueue({ name: QUEUES.automation, defaultJobOptions: { attempts: 1 } });

/** HTTP: cria, consulta e cancela sessões; serve evidências. Nunca abre navegador. */
@Module({
  imports: [automationQueue, ActivityModule],
  controllers: [BrowserController],
  providers: [BrowserService],
  exports: [BrowserService],
})
export class BrowserModule {}

/** Worker: grava resultados do executor e apaga evidências vencidas. */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.automationResults, defaultJobOptions: { attempts: 3, removeOnComplete: true, removeOnFail: { age: 7 * 24 * 3600 } } }),
    BullModule.registerQueue({ name: QUEUES.maintenance, defaultJobOptions: { removeOnComplete: true } }),
    ActivityCoreModule,
  ],
  providers: [AutomationResultsProcessor, EvidenceCleanupProcessor],
})
export class BrowserWorkerModule {}
