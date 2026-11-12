import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, {
    logger: env.NODE_ENV === 'production' ? new ConsoleLogger({ json: true }) : undefined,
  });
  configureApp(app, env);
  await app.listen(env.PORT);
  Logger.log(`API do JARVIS em http://localhost:${env.PORT}/api`, 'Bootstrap');
}
await bootstrap();
