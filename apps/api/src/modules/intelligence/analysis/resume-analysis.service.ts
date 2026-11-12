import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { ResumeAnalysisDto, ResumeAnalysisLlm, ScoredCriterion } from '@jarvis/shared';
import { PrismaService } from '../../../common/prisma.service.js';
import type { ResumeAnalysis } from '../../../generated/prisma/client.js';
import { QUEUES, type ResumeAnalysisJob } from '../../../queues/queues.js';
import { ActivityService } from '../../activity/activity.service.js';
import { TasksService } from '../../activity/tasks.service.js';
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm-provider.js';
import { UsageService } from '../llm/usage.service.js';

/** Formato persistido em ResumeAnalysis.result. */
export interface StoredAnalysis {
  criteria: ScoredCriterion[];
  analysis: Omit<ResumeAnalysisLlm, 'criteria'>;
}

export function toAnalysisDto(a: ResumeAnalysis): ResumeAnalysisDto {
  const stored = a.result as StoredAnalysis | null;
  return {
    id: a.id,
    resumeId: a.resumeId,
    status: a.status,
    model: a.model,
    score: a.score,
    criteria: stored?.criteria ?? null,
    result: stored?.analysis ?? null,
    error: a.error,
    createdAt: a.createdAt.toISOString(),
    completedAt: a.completedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class ResumeAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly tasks: TasksService,
    private readonly usage: UsageService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @InjectQueue(QUEUES.analysis) private readonly queue: Queue<ResumeAnalysisJob>,
  ) {}

  /** Enfileira a análise. Se já houver uma em andamento para o currículo, devolve a mesma. */
  async request(userId: string, resumeId: string): Promise<ResumeAnalysisDto> {
    if (!this.llm.configured) {
      throw new ServiceUnavailableException('A análise por IA não está configurada neste ambiente.');
    }
    const resume = await this.prisma.resume.findFirst({ where: { id: resumeId, userId } });
    if (!resume) throw new NotFoundException('Currículo não encontrado');
    if (resume.status !== 'EXTRACTED' || !resume.extractedText) {
      throw new ConflictException('O currículo ainda não foi lido. Aguarde a leitura terminar.');
    }

    const inFlight = await this.prisma.resumeAnalysis.findFirst({
      where: { resumeId, userId, status: { in: ['QUEUED', 'RUNNING'] } },
    });
    if (inFlight) return toAnalysisDto(inFlight);

    await this.usage.assertWithinBudget(userId);

    const analysis = await this.prisma.resumeAnalysis.create({ data: { userId, resumeId } });
    const jobId = `resume-analyze-${analysis.id}`;
    const task = await this.tasks.create(userId, 'resume.analyze', jobId);
    await this.queue.add('analyze', { userId, resumeId, analysisId: analysis.id, taskId: task.id }, { jobId, attempts: 2 });
    await this.activity.record(userId, {
      type: 'resume.analysis_queued',
      title: `Análise do currículo solicitada: ${resume.originalName}`,
      detail: 'A IA vai avaliar o documento por seis critérios públicos.',
      subject: `resume:${resumeId}`,
      taskId: task.id,
    });
    return toAnalysisDto(analysis);
  }

  async latest(userId: string, resumeId: string): Promise<ResumeAnalysisDto | null> {
    const resume = await this.prisma.resume.findFirst({ where: { id: resumeId, userId }, select: { id: true } });
    if (!resume) throw new NotFoundException('Currículo não encontrado');
    const a = await this.prisma.resumeAnalysis.findFirst({ where: { resumeId, userId }, orderBy: { createdAt: 'desc' } });
    return a ? toAnalysisDto(a) : null;
  }
}
