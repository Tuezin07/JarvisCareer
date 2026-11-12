import { Module } from '@nestjs/common';
import { bullRoot } from './app.module.js';
import { CommonModule } from './common/common.module.js';
import { ResumesWorkerModule } from './modules/resumes/resumes.module.js';

/** Processadores de fila. Sem HTTP, sem navegador (automação fica em apps/automation). */
@Module({
  imports: [CommonModule, bullRoot, ResumesWorkerModule],
})
export class WorkerModule {}
