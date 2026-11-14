import type { DefaultJobOptions } from 'bullmq';

export const QUEUES = {
  resume: 'resume',
  analysis: 'analysis',
  research: 'research',
  /** Tarefas para o executor isolado (apps/automation). */
  automation: 'automation',
  /** Resultados devolvidos pelo executor. */
  automationResults: 'automation-results',
  maintenance: 'maintenance',
} as const;

export const automationCancelKey = (sessionId: string) => `jarvis:automation:cancel:${sessionId}`;

export interface ResumeExtractJob {
  userId: string;
  resumeId: string;
  taskId: string;
}

/** Fila research: 'source.sync' lê uma página de vagas; 'match.user' recalcula a compatibilidade de um candidato. */
export interface SourceSyncJob {
  sourceId: string;
  /** Importação de uma vaga específica por link: cria o match mesmo sem acompanhar a empresa. */
  importForUser?: { userId: string; externalId: string };
}

export interface MatchUserJob {
  userId: string;
}

export type ResearchJob = SourceSyncJob | MatchUserJob;

export const SOURCE_SYNC_EVERY_MS = 6 * 3600 * 1000;
export const sourceSchedulerId = (sourceId: string) => `source-sync-${sourceId}`;

export interface ResumeAnalysisJob {
  userId: string;
  resumeId: string;
  analysisId: string;
  taskId: string;
}

/** Ids determinísticos garantem idempotência: o mesmo trabalho não entra duas vezes na fila. */
export const resumeExtractJobId = (resumeId: string, run = 0) =>
  run === 0 ? `resume-extract-${resumeId}` : `resume-extract-${resumeId}-r${run}`;

export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};
