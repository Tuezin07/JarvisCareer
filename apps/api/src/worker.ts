import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadEnv } from './config/env.js';
import { WorkerModule } from './worker.module.js';

/** Entrypoint dos workers BullMQ: processo separado da API, sem servidor HTTP. */
async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: env.NODE_ENV === 'production' ? new ConsoleLogger({ json: true }) : undefined,
  });
  app.enableShutdownHooks();
  Logger.log('Workers do JARVIS ativos (fila: resume)', 'Worker');
}
await bootstrap();
