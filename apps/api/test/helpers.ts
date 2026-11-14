import { type INestApplication, type INestApplicationContext, Logger } from '@nestjs/common';
import { LLM_PROVIDER, type LlmProvider } from '../src/modules/intelligence/llm/llm-provider.js';
import { JOB_HTTP, type JobHttp } from '../src/modules/jobs/connectors/job-http.js';
import { NestFactory } from '@nestjs/core';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { loadEnv } from '../src/config/env.js';
import { WorkerModule } from '../src/worker.module.js';

/** Substitutos de dependências externas: modelo de linguagem e HTTP dos conectores de vagas. */
export interface Fakes {
  llm?: LlmProvider;
  jobHttp?: JobHttp;
}

function applyFakes(builder: TestingModuleBuilder, fakes: Fakes): TestingModuleBuilder {
  let b = builder;
  if (fakes.llm) b = b.overrideProvider(LLM_PROVIDER).useValue(fakes.llm);
  if (fakes.jobHttp) b = b.overrideProvider(JOB_HTTP).useValue(fakes.jobHttp);
  return b;
}

export async function createApi(fakes: Fakes = {}): Promise<INestApplication> {
  const app = (await applyFakes(Test.createTestingModule({ imports: [AppModule] }), fakes).compile()).createNestApplication({
    logger: false,
  });
  configureApp(app, loadEnv());
  await app.init();
  return app;
}

export async function createWorker(fakes: Fakes = {}): Promise<INestApplicationContext> {
  if (!fakes.llm && !fakes.jobHttp) return NestFactory.createApplicationContext(WorkerModule, { logger: false });
  const moduleRef = await applyFakes(Test.createTestingModule({ imports: [WorkerModule] }), fakes)
    .setLogger(new Logger())
    .compile();
  moduleRef.useLogger(false);
  return moduleRef.init();
}

export const PASSWORD = 'senha-forte-123';

/** Registra um candidato novo e devolve um agente HTTP com os cookies da sessão. */
export async function registerCandidate(app: INestApplication, name = 'Candidato Teste') {
  const agent = request.agent(app.getHttpServer()) as unknown as TestAgent;
  const email = `c-${randomUUID()}@example.com`;
  const res = await agent
    .post('/api/auth/register')
    .send({ fullName: name, email, password: PASSWORD, acceptTerms: true, acceptPrivacy: true })
    .expect(201);
  return { agent, email, id: res.body.id as string };
}

export async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 15_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value !== undefined) return value;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Tempo esgotado esperando condição');
}
