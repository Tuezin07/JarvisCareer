import { Module } from '@nestjs/common';
import { ActivityCoreModule, ActivityModule } from '../activity/activity.module.js';
import { AshbyConnector } from './connectors/ashby.connector.js';
import { ConnectorRegistry } from './connectors/connectors.registry.js';
import { GreenhouseConnector } from './connectors/greenhouse.connector.js';
import { FetchJobHttp, JOB_HTTP } from './connectors/job-http.js';
import { LeverConnector } from './connectors/lever.connector.js';
import { JobsQueueModule } from './jobs-queue.module.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';
import { MatchingService } from './matching/matching.service.js';
import { ResearchProcessor } from './research.processor.js';
import { SyncService } from './sync.service.js';

const connectors = [
  { provide: JOB_HTTP, useClass: FetchJobHttp },
  GreenhouseConnector,
  LeverConnector,
  AshbyConnector,
  ConnectorRegistry,
];

/** HTTP: empresas acompanhadas, importação por link, lista e detalhe de vagas. */
@Module({
  imports: [JobsQueueModule, ActivityModule],
  controllers: [JobsController],
  providers: [...connectors, JobsService],
  exports: [JobsService],
})
export class JobsModule {}

/** Worker: leitura das páginas de vagas e recálculo de compatibilidade. */
@Module({
  imports: [JobsQueueModule, ActivityCoreModule],
  providers: [...connectors, SyncService, MatchingService, ResearchProcessor],
})
export class JobsWorkerModule {}
