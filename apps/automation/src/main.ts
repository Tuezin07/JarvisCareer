import { loadConfig } from './config.ts';
import { createAutomationWorker } from './worker.ts';

const cfg = loadConfig();
const worker = createAutomationWorker(cfg);
console.log(
  `[automation] JARVIS WEB ativo · navegador ${cfg.provider} · concorrência ${cfg.concurrency} · loopback liberado: ${[...cfg.allowLoopback].join(', ') || 'nenhum'}`,
);

const shutdown = async () => {
  await worker.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
