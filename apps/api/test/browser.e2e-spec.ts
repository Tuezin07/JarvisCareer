import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import type { Server } from 'node:http';
import type { BrowserSessionDto, ResumeDto } from '@jarvis/shared';
import { PrismaService } from '../src/common/prisma.service.js';
import { startTestSite } from '../../automation/test-site/server.ts';
import { type AutomationWorker, createAutomationWorker } from '../../automation/src/worker.ts';
import { makePdf, SAMPLE_RESUME_LINES } from './fixtures/make-pdf.js';
import { createApi, createWorker, registerCandidate, waitFor } from './helpers.js';

type Agent = Awaited<ReturnType<typeof registerCandidate>>['agent'];

/**
 * Fluxo completo do JARVIS WEB: API → fila → executor real (Chromium/Playwright) →
 * site de testes controlado → fila de resultados → worker da API → banco e evidências.
 */
let app: INestApplication;
let worker: INestApplicationContext;
let automation: AutomationWorker;
let site: Server | null = null;
let prisma: PrismaService;

beforeAll(async () => {
  const siteUrl = new URL(process.env.AUTOMATION_TEST_SITE_URL ?? 'http://127.0.0.1:4100');
  site = await startTestSite(Number(siteUrl.port), siteUrl.hostname).catch(() => null); // já rodando em dev: reaproveita
  app = await createApi();
  worker = await createWorker();
  automation = createAutomationWorker({
    redisUrl: process.env.REDIS_URL as string,
    provider: 'local',
    headless: true,
    concurrency: 1,
    allowLoopback: new Set([siteUrl.host]),
    browserbaseApiKey: null,
    browserbaseProjectId: null,
  });
  prisma = app.get(PrismaService);
}, 120_000);

afterAll(async () => {
  await automation?.close();
  await worker?.close();
  await app?.close();
  await new Promise<void>((r) => (site ? site.close(() => r()) : r()));
});

async function candidate(consent: boolean) {
  const c = await registerCandidate(app, 'Ana Souza');
  await c.agent.put('/api/profile').send({ fullName: 'Ana Souza', phone: '41999990000', city: 'Curitiba', state: 'PR' }).expect(200);
  const up = await c.agent.post('/api/resumes').attach('file', makePdf(SAMPLE_RESUME_LINES), 'curriculo-ana.pdf').expect(201);
  if (consent) await c.agent.post('/api/privacy/consents').send({ type: 'EVIDENCE_SCREENSHOTS', granted: true }).expect(200);
  return { ...c, resumeId: (up.body as ResumeDto).id };
}

async function finished(agent: Agent, id: string) {
  return waitFor(async () => {
    const s = (await agent.get(`/api/browser/sessions/${id}`).expect(200)).body as BrowserSessionDto;
    return ['QUEUED', 'RUNNING'].includes(s.status) ? undefined : s;
  }, 60_000);
}

describe('JARVIS WEB', () => {
  it('preenche o formulário de testes com o perfil e o currículo, para antes de enviar e guarda evidências', async () => {
    const { agent, id: userId } = await candidate(true);
    const created = (await agent.post('/api/browser/test-form').expect(202)).body as BrowserSessionDto;
    expect(created.status).toBe('QUEUED');

    const s = await finished(agent, created.id);
    expect(s.status).toBe('WAITING_HUMAN');
    expect(s.provider).toBe('local');
    const auto = s.mapping.filter((m) => m.status === 'AUTO').map((m) => m.label);
    expect(auto).toEqual(['Nome', 'Sobrenome', 'E-mail', 'Telefone', 'Cidade', 'Currículo (PDF ou DOCX)']);
    expect(s.mapping.find((m) => m.type === 'checkbox')!.status).toBe('NEEDS_HUMAN');
    expect(s.mapping.find((m) => m.label.startsWith('Gênero'))!.status).toBe('SKIPPED');
    expect(s.steps.filter((p) => p.action === 'fill').every((p) => p.status === 'OK')).toBe(true);
    expect(s.finalUrl).toContain('/vagas/42/aplicar');

    expect(s.evidence.map((e) => e.label)).toEqual(['Página aberta', 'Formulário preenchido (não enviado)']);
    const img = await agent.get(`/api${s.evidence[1].url}`).expect(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.headers['cache-control']).toContain('no-store');
    expect(img.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(img.body.length).toBeGreaterThan(5_000);

    // Nada do valor dos campos fica salvo: só de onde viria o dado.
    const row = await prisma.browserSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(JSON.stringify(row.result)).not.toContain('41999990000');

    const events = await prisma.agentEvent.findMany({ where: { userId, type: { startsWith: 'browser.' } }, select: { type: true } });
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['browser.session_created', 'browser.session_waiting_human']));
    expect(await prisma.auditLog.findFirst({ where: { userId, action: 'browser.session.create' } })).not.toBeNull();
  });

  it('sem consentimento, nenhuma captura é guardada', async () => {
    const { agent } = await candidate(false);
    const created = (await agent.post('/api/browser/test-form').expect(202)).body as BrowserSessionDto;
    const s = await finished(agent, created.id);
    expect(s.status).toBe('WAITING_HUMAN');
    expect(s.evidence).toEqual([]);
    expect(s.screenshotsConsent).toBe(false);
    expect(await prisma.actionEvidence.count({ where: { sessionId: s.id } })).toBe(0);
  });

  it('isolamento: sessões e evidências de um candidato são 404 para outro', async () => {
    const a = await candidate(true);
    const b = await registerCandidate(app);
    const created = (await a.agent.post('/api/browser/test-form').expect(202)).body as BrowserSessionDto;
    const s = await finished(a.agent, created.id);

    await b.agent.get(`/api/browser/sessions/${s.id}`).expect(404);
    await b.agent.get(`/api${s.evidence[0].url}`).expect(404);
    await b.agent.post(`/api/browser/sessions/${s.id}/cancel`).expect(404);
    expect((await b.agent.get('/api/browser/sessions').expect(200)).body).toEqual([]);
  });

  it('uma sessão por vez; pausa global bloqueia novas sessões', async () => {
    const { agent, id: userId } = await candidate(false);
    const first = (await agent.post('/api/browser/test-form').expect(202)).body as BrowserSessionDto;
    const second = await agent.post('/api/browser/test-form').expect(409);
    expect(second.body.message).toContain('em andamento');
    await finished(agent, first.id);

    await prisma.candidatePreferences.upsert({ where: { userId }, create: { userId, searchPaused: true }, update: { searchPaused: true } });
    const paused = await agent.post('/api/browser/test-form').expect(409);
    expect(paused.body.message).toContain('pausadas');
  });

  it('inspeção só aceita vagas da própria lista do candidato', async () => {
    const { agent } = await candidate(false);
    await agent.post('/api/browser/inspect').send({ jobId: '00000000-0000-4000-8000-000000000000' }).expect(404);
    await agent.post('/api/browser/inspect').send({ jobId: 'nao-e-uuid' }).expect(400);
  });
});
