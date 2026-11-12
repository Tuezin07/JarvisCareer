import type { DefaultJobOptions } from 'bullmq';

export const QUEUES = {
  resume: 'resume',
} as const;

export interface ResumeExtractJob {
  userId: string;
  resumeId: string;
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
