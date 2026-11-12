import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service.js';

/** Ciclo de vida de AgentTask: espelha o job da fila com dados consultáveis pelo candidato. */
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, kind: string, queueJobId: string) {
    return this.prisma.agentTask.create({ data: { userId, kind, queueJobId } });
  }

  markRunning(id: string, attempt: number) {
    return this.prisma.agentTask.update({
      where: { id },
      data: { status: 'RUNNING', attempts: attempt, startedAt: new Date() },
    });
  }

  markSucceeded(id: string) {
    return this.prisma.agentTask.update({
      where: { id },
      data: { status: 'SUCCEEDED', finishedAt: new Date(), error: null },
    });
  }

  markFailed(id: string, error: string) {
    return this.prisma.agentTask.update({
      where: { id },
      data: { status: 'FAILED', finishedAt: new Date(), error: error.slice(0, 1000) },
    });
  }
}
