import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { JobDetailDto, JobsListResponse, JobSourceDto } from '@jarvis/shared';
import { PrismaService } from '../src/common/prisma.service.js';
import { QUEUES, sourceSchedulerId } from '../src/queues/queues.js';
import { FakeLlmProvider, fakeMessage, text, toolUse } from './fake-llm.provider.js';
import { FakeJobHttp, ghBoard, ghJobs, LEVER_JOB_ID, leverPostings } from './fixtures/job-boards.js';
import { createApi, createWorker, registerCandidate, waitFor } from './helpers.js';

type Agent = Awaited<ReturnType<typeof registerCandidate>>['agent'];

let app: INestApplication;
let worker: INestApplicationContext;
let prisma: PrismaService;
const http = new FakeJobHttp();
const llm = new FakeLlmProvider();
const createdSources = new Set<string>();

/** Tokens únicos por execução: o banco de teste acumula execuções anteriores. */
const run = randomUUID().slice(0, 8);
const ghToken = `acme${run}`;
const ghBoardUrl = `https://boards-api.greenhouse.io/v1/boards/${ghToken}`;
const ghJobsUrl = `${ghBoardUrl}/jobs?content=true`;
const leverSite = `globex${run}`;

beforeAll(async () => {
  http.set(ghBoardUrl, ghBoard).set(ghJobsUrl, ghJobs());
  http.set(`https://api.lever.co/v0/postings/${leverSite}?mode=json&limit=1`, leverPostings());
  http.set(`https://api.lever.co/v0/postings/${leverSite}?mode=json`, leverPostings());
  app = await createApi({ jobHttp: http, llm });
  worker = await createWorker({ jobHttp: http, llm });
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  // Remove só os agendamentos criados por este teste (evita chamadas reais em execuções futuras).
  const queue = app.get<Queue>(getQueueToken(QUEUES.research));
  for (const id of createdSources) await queue.removeJobScheduler(sourceSchedulerId(id));
  await worker?.close();
  await app?.close();
});

async function profileForSupport(agent: Agent) {
  await agent
    .put('/api/profile')
    .send({ fullName: 'Dani Suporte', city: 'Curitiba', state: 'PR', targetRoles: ['Analista de suporte técnico'] })
    .expect(200);
  await agent.put('/api/profile/skills').send({ items: [{ name: 'Windows' }, { name: 'Redes' }, { name: 'Excel' }] }).expect(200);
  await agent
    .put('/api/profile/preferences')
    .send({ workModes: ['ONSITE', 'HYBRID', 'REMOTE'], contractTypes: ['CLT'], constraints: [{ kind: 'NO_WEEKENDS', strength: 'ELIMINATORY' }] })
    .expect(200);
}

async function follow(agent: Agent, url = `https://job-boards.greenhouse.io/${ghToken}`): Promise<JobSourceDto> {
  const res = await agent.post('/api/jobs/sources').send({ url }).expect(201);
  createdSources.add(res.body.id);
  return res.body as JobSourceDto;
}

async function jobs(agent: Agent, qs = ''): Promise<JobsListResponse> {
  return (await agent.get(`/api/jobs${qs}`).expect(200)).body as JobsListResponse;
}

/** Espera o sync e o recálculo terminarem (a lista estabiliza com `expected` itens). */
async function waitJobs(agent: Agent, expected: number, qs = '?includeEliminated=true') {
  return waitFor(async () => {
    const r = await jobs(agent, qs);
    return r.total === expected && r.items.every((j) => j.topReasons.length > 0) ? r : undefined;
  });
}

describe('pesquisa de vagas', () => {
  it('acompanha uma empresa, lê as vagas pela API oficial e ordena pela compatibilidade', async () => {
    const { agent, id: userId } = await registerCandidate(app, 'Dani Suporte');
    await profileForSupport(agent);
    const source = await follow(agent);
    expect(source).toMatchObject({ provider: 'GREENHOUSE', boardToken: ghToken, companyName: 'Acme Tecnologia' });

    const all = await waitJobs(agent, 3);
    const byTitle = Object.fromEntries(all.items.map((j) => [j.title, j]));
    expect(byTitle['Operador de Loja'].eliminated).toBe(true);
    expect(byTitle['Operador de Loja'].topReasons[0]).toContain('fim de semana');

    const visible = await jobs(agent);
    expect(visible.total).toBe(2);
    expect(visible.items[0].title).toBe('Analista de Suporte Técnico Júnior');
    expect(visible.items[0].score).toBeGreaterThan(visible.items[1].score);

    const detail = (await agent.get(`/api/jobs/${visible.items[0].id}`).expect(200)).body as JobDetailDto;
    expect(detail.breakdown.criteria).toHaveLength(7);
    expect(detail.breakdown.matchedSkills).toEqual(expect.arrayContaining(['Windows', 'Redes']));
    expect(detail.breakdown.met.some((m) => m.includes('Curitiba'))).toBe(true);
    expect(detail.description).toContain('Windows');
    expect(detail.description).not.toContain('&lt;');
    expect(detail.applyUrl).toBe(`https://job-boards.greenhouse.io/acme/jobs/101`);

    const sources = (await agent.get('/api/jobs/sources').expect(200)).body as JobSourceDto[];
    expect(sources[0]).toMatchObject({ openJobCount: 3, status: 'ACTIVE' });
    expect((await agent.get('/api/dashboard/summary').expect(200)).body.jobsFound).toBe(2);

    const events = await prisma.agentEvent.findMany({ where: { userId }, select: { type: true } });
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['jobs.source_followed', 'jobs.source_synced', 'jobs.new_matches']));
    expect(await prisma.auditLog.findFirst({ where: { userId, action: 'jobs.source.follow' } })).not.toBeNull();
  });

  it('vaga que some da página é encerrada (não apagada) e sai da lista', async () => {
    const { agent } = await registerCandidate(app);
    await profileForSupport(agent);
    const source = await follow(agent);
    await waitJobs(agent, 3);

    const without = ghJobs();
    without.jobs = without.jobs.filter((j) => j.id !== 103);
    http.set(ghJobsUrl, without);
    try {
      await agent.post(`/api/jobs/sources/${source.id}/sync`).expect(202);
      await waitJobs(agent, 2);
      const closed = await prisma.jobListing.findFirstOrThrow({ where: { sourceId: source.id, externalId: '103' } });
      expect(closed.closedAt).not.toBeNull();
    } finally {
      http.set(ghJobsUrl, ghJobs());
    }
  });

  it('links não suportados e páginas inexistentes são recusados', async () => {
    const { agent } = await registerCandidate(app);
    const bad = await agent.post('/api/jobs/sources').send({ url: 'https://www.linkedin.com/jobs/view/1' }).expect(400);
    expect(bad.body.message).toContain('Link não reconhecido');
    const missing = await agent.post('/api/jobs/sources').send({ url: `https://job-boards.greenhouse.io/inexistente${run}` }).expect(400);
    expect(missing.body.message).toContain('não existe');
  });

  it('mudança de preferências recalcula a compatibilidade', async () => {
    const { agent } = await registerCandidate(app);
    await profileForSupport(agent);
    await follow(agent);
    await waitJobs(agent, 3);

    await agent
      .put('/api/profile/preferences')
      .send({ contractTypes: ['CLT'], constraints: [{ kind: 'MIN_SALARY', strength: 'ELIMINATORY', value: 4000 }] })
      .expect(200);
    const support = await waitFor(async () => {
      const r = await jobs(agent, '?includeEliminated=true&q=Suporte');
      return r.items[0]?.eliminated ? r.items[0] : undefined;
    });
    expect(support.topReasons[0]).toContain('abaixo do mínimo');
  });

  it('pesos personalizados recalculam a nota; soma diferente de 100 é recusada; null restaura o padrão', async () => {
    const { agent } = await registerCandidate(app);
    await profileForSupport(agent);
    await follow(agent);
    const before = await waitJobs(agent, 3);
    const supportId = before.items.find((j) => j.title === 'Analista de Suporte Técnico Júnior')!.id;
    const defaultScore = ((await agent.get(`/api/jobs/${supportId}`).expect(200)).body as JobDetailDto).score;

    const bad = { skills: 50, experience: 50, role: 50, seniority: 0, location: 0, education: 0, compensation: 0 };
    await agent.put('/api/profile/match-weights').send({ weights: bad }).expect(400);

    const onlySkills = { skills: 100, experience: 0, role: 0, seniority: 0, location: 0, education: 0, compensation: 0 };
    const saved = await agent.put('/api/profile/match-weights').send({ weights: onlySkills }).expect(200);
    expect(saved.body.preferences.matchWeights).toEqual(onlySkills);
    const custom = await waitFor(async () => {
      const d = (await agent.get(`/api/jobs/${supportId}`).expect(200)).body as JobDetailDto;
      return d.breakdown.criteria.find((c) => c.key === 'skills')?.weight === 100 ? d : undefined;
    });
    expect(custom.score).toBe(custom.breakdown.criteria.find((c) => c.key === 'skills')!.score);

    const reset = await agent.put('/api/profile/match-weights').send({ weights: null }).expect(200);
    expect(reset.body.preferences.matchWeights).toBeNull();
    const back = await waitFor(async () => {
      const d = (await agent.get(`/api/jobs/${supportId}`).expect(200)).body as JobDetailDto;
      return d.breakdown.criteria.find((c) => c.key === 'skills')?.weight === 30 ? d : undefined;
    });
    expect(back.score).toBe(defaultScore);
  });

  it('cada candidato tem sua própria lista; detalhe de vaga alheia responde 404', async () => {
    const a = await registerCandidate(app);
    const b = await registerCandidate(app);
    await profileForSupport(a.agent);
    const source = await follow(a.agent);
    const listA = await waitJobs(a.agent, 3);

    await b.agent.get(`/api/jobs/${listA.items[0].id}`).expect(404);
    expect((await jobs(b.agent, '?includeEliminated=true')).total).toBe(0);
    await b.agent.post(`/api/jobs/sources/${source.id}/sync`).expect(404);
    await b.agent.delete(`/api/jobs/sources/${source.id}`).expect(404);

    // B acompanha a mesma empresa: a fonte é compartilhada, as compatibilidades não.
    const sameSource = await follow(b.agent);
    expect(sameSource.id).toBe(source.id);
    await waitJobs(b.agent, 3);
    await b.agent.post(`/api/jobs/${listA.items[0].id}/status`).send({ status: 'DISMISSED' }).expect(200);
    const stillA = (await a.agent.get(`/api/jobs/${listA.items[0].id}`).expect(200)).body as JobDetailDto;
    expect(stillA.status).toBe('NEW');
  });

  it('vaga salva continua na lista depois de deixar de acompanhar a empresa', async () => {
    const { agent } = await registerCandidate(app);
    await profileForSupport(agent);
    const source = await follow(agent);
    const list = await waitJobs(agent, 3);
    const saved = list.items.find((j) => j.title === 'Analista de Suporte Técnico Júnior')!;
    await agent.post(`/api/jobs/${saved.id}/status`).send({ status: 'SAVED' }).expect(200);

    await agent.delete(`/api/jobs/sources/${source.id}`).expect(204);
    const after = await jobs(agent, '?includeEliminated=true');
    expect(after.items.map((j) => j.id)).toEqual([saved.id]);
    expect((await agent.get('/api/jobs/sources').expect(200)).body).toEqual([]);
  });

  it('importa uma vaga específica por link sem acompanhar a empresa', async () => {
    const { agent } = await registerCandidate(app);
    await profileForSupport(agent);
    await agent.post('/api/jobs/import').send({ url: `https://jobs.lever.co/${leverSite}/${LEVER_JOB_ID}` }).expect(202);
    const r = await waitJobs(agent, 1);
    expect(r.items[0]).toMatchObject({ title: 'Desenvolvedor Júnior React', provider: 'LEVER', workplaceType: 'REMOTE' });
    expect((await agent.get('/api/jobs/sources').expect(200)).body).toEqual([]);
    const created = await prisma.jobSource.findUniqueOrThrow({ where: { provider_boardToken: { provider: 'LEVER', boardToken: leverSite } } });
    createdSources.add(created.id);

    await agent.post('/api/jobs/import').send({ url: `https://jobs.lever.co/${leverSite}` }).expect(400);
  });

  it('com as operações pausadas, a empresa não é lida', async () => {
    const { agent, id: userId } = await registerCandidate(app);
    const token = `pausa${run}`;
    http.set(`https://boards-api.greenhouse.io/v1/boards/${token}`, ghBoard);
    http.set(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`, ghJobs());
    await prisma.candidatePreferences.create({ data: { userId, searchPaused: true } });

    const source = await follow(agent, `https://job-boards.greenhouse.io/${token}`);
    await new Promise((r) => setTimeout(r, 1500));
    const s = await prisma.jobSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(s.lastSyncedAt).toBeNull();
    expect(http.calls.filter((u) => u.includes(`${token}/jobs`))).toHaveLength(0);
  });
});

describe('ferramentas de vagas do agente', () => {
  it('search_jobs devolve vagas reais com nota; links vindos do modelo passam pela mesma validação', async () => {
    const { agent } = await registerCandidate(app);
    await profileForSupport(agent);
    await follow(agent);
    await waitJobs(agent, 3);
    const conv = (await agent.post('/api/conversations').send({}).expect(201)).body.id as string;

    llm.script(
      fakeMessage([toolUse('search_jobs', { query: 'suporte', min_score: 0 }), toolUse('follow_company_jobs', { url: 'https://evil.example/x' })], 'tool_use'),
      fakeMessage([text('Encontrei a vaga de suporte.')], 'end_turn'),
    );
    const n = llm.turnRequests.length;
    await agent.post(`/api/conversations/${conv}/messages`).send({ text: 'Tem vaga de suporte?' }).buffer(true).expect(200);

    const results = llm.turnRequests[n + 1].messages.at(-1)!.content as Array<{ content: string; is_error?: boolean }>;
    const search = JSON.parse(results[0].content) as { total: number; vagas: Array<{ titulo: string; nota: number }> };
    expect(search.total).toBe(1);
    expect(search.vagas[0].titulo).toBe('Analista de Suporte Técnico Júnior');
    expect(results[1].is_error).toBe(true);
    expect(results[1].content).toContain('Link não reconhecido');
  });
});
