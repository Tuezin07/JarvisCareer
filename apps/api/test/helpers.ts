import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { loadEnv } from '../src/config/env.js';
import { WorkerModule } from '../src/worker.module.js';

export async function createApi(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, loadEnv());
  await app.init();
  return app;
}

export function createWorker(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(WorkerModule, { logger: false });
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
