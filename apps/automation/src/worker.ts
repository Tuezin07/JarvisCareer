import { automationTaskSchema, type AutomationResult } from '@jarvis/shared';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { AutomationConfig } from './config.ts';
import { runTask } from './run-task.ts';

/** Filas compartilhadas com a API (mesmo prefixo). */
export const TASK_QUEUE = 'automation';
export const RESULTS_QUEUE = 'automation-results';
export const cancelKey = (sessionId: string) => `jarvis:automation:cancel:${sessionId}`;

export interface AutomationWorker {
  close(): Promise<void>;
}

/**
 * Consome tarefas da fila e devolve resultados por outra fila. O executor não tem
 * acesso ao banco: só ao Redis (filas, sinal de cancelamento e estado efêmero do núcleo).
 */
export function createAutomationWorker(cfg: AutomationConfig, deps: { resolve?: (host: string) => Promise<string[]> } = {}): AutomationWorker {
  const connection = { url: cfg.redisUrl };
  const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: 2 });
  const results = new Queue(RESULTS_QUEUE, { connection, prefix: 'jarvis' });

  const publishState = async (userId: string, label: string) => {
    const snapshot = { state: 'executing', label, updatedAt: new Date().toISOString() };
    await redis.set(`jarvis:state:${userId}`, JSON.stringify(snapshot), 'EX', 600);
    await redis.publish(`jarvis:user:${userId}`, JSON.stringify({ kind: 'state', snapshot }));
  };

  const worker = new Worker(
    TASK_QUEUE,
    async (job) => {
      const parsed = automationTaskSchema.safeParse(job.data);
      if (!parsed.success) throw new Error(`Tarefa inválida: ${parsed.error.issues[0]?.message}`);
      const task = parsed.data;

      await results.add('started', { sessionId: task.sessionId, userId: task.userId, startedAt: new Date().toISOString() });
      await publishState(task.userId, task.kind === 'INSPECT_PAGE' ? 'Inspecionando a página de candidatura' : 'Preenchendo o formulário de testes');

      const result: AutomationResult = await runTask(task, {
        cfg,
        resolve: deps.resolve,
        isCancelled: async () => (await redis.exists(cancelKey(task.sessionId))) === 1,
      });
      await results.add('result', result, { jobId: `result-${task.sessionId}` });
      return { status: result.status, steps: result.steps.length };
    },
    { connection, prefix: 'jarvis', concurrency: cfg.concurrency, lockDuration: 6 * 60_000 },
  );
  worker.on('failed', (job, err) => console.error(`[automation] tarefa ${job?.id} falhou: ${err.message}`));

  return {
    async close() {
      await worker.close();
      await results.close();
      await redis.quit();
    },
  };
}
