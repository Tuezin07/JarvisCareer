import { Module } from '@nestjs/common';
import { ActivityStreamService } from './activity-stream.service.js';
import { ActivityController } from './activity.controller.js';
import { ActivityService } from './activity.service.js';
import { TasksService } from './tasks.service.js';

/** Versão HTTP: inclui o canal SSE. */
@Module({
  controllers: [ActivityController],
  providers: [ActivityService, ActivityStreamService, TasksService],
  exports: [ActivityService, TasksService],
})
export class ActivityModule {}

/** Versão worker: só publica, não assina nem expõe rotas. */
@Module({
  providers: [ActivityService, TasksService],
  exports: [ActivityService, TasksService],
})
export class ActivityCoreModule {}
