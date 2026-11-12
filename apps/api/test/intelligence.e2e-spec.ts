import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import type { ChatMessageDto, ChatStreamEvent, ResumeAnalysisDto, ResumeAnalysisLlm, ResumeDto } from '@jarvis/shared';
import { PrismaService } from '../src/common/prisma.service.js';
import { RedisService } from '../src/common/redis.service.js';
import { FakeLlmProvider, fakeMessage, text, toolUse } from './fake-llm.provider.js';
import { makePdf, SAMPLE_RESUME_LINES } from './fixtures/make-pdf.js';
import { createApi, createWorker, registerCandidate, waitFor } from './helpers.js';

let app: INestApplication;
let worker: INestApplicationContext;
let prisma: PrismaService;
const llm = new FakeLlmProvider();

beforeAll(async () => {
  app = await createApi(llm);
  worker = await createWorker(llm);
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await worker?.close();
  await app?.close();
});

beforeEach(() => {
  llm.configured = true;
});

function parseStream(body: string): ChatStreamEvent[] {
  return body
    .split('\n\n')
    .filter((f) => f.startsWith('data: '))
    .map((f) => JSON.parse(f.slice(6)) as ChatStreamEvent);
}

async function newConversation(agent: Awaited<ReturnType<typeof registerCandidate>>['agent']) {
  const res = await agent.post('/api/conversations').send({}).expect(201);
  return res.body.id as string;
}

async function say(agent: Awaited<ReturnType<typeof registerCandidate>>['agent'], conversationId: string, message: string) {
  const res = await agent.post(`/api/conversations/${conversationId}/messages`).send({ text: message }).buffer(true).expect(200);
  expect(res.headers['content-type']).toContain('text/event-stream');
  return parseStream(res.text);
}

describe('conversa com ferramentas', () => {
  it('responde usando dados reais, persiste o histórico append-only e registra custo', async () => {
    const { agent, id: userId } = await registerCandidate(app, 'Ana Souza');
    await agent.post('/api/resumes').attach('file', makePdf(SAMPLE_RESUME_LINES), 'cv.pdf').expect(201);
    const conversationId = await newConversation(agent);

    llm.script(
      fakeMessage([text('Vou verificar o histórico.'), toolUse('get_activity_history', { hours: 24 })], 'tool_use'),
      fakeMessage([text('Nas últimas 24 horas recebi seu currículo cv.pdf.')], 'end_turn'),
    );
    const before = llm.turnRequests.length;
    const events = await say(agent, conversationId, 'O que você fez nas últimas 24 horas?');

    expect(events[0]).toMatchObject({ type: 'user_message' });
    const tools = events.filter((e) => e.type === 'tool');
    expect(tools.map((e) => e.type === 'tool' && e.activity.status)).toEqual(['running', 'succeeded']);
    const streamed = events.filter((e) => e.type === 'text').map((e) => (e.type === 'text' ? e.delta : '')).join('');
    expect(streamed).toContain('recebi seu currículo');
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'end_turn' });

    // A segunda volta recebeu o pedido de ferramenta intacto e o resultado com dados reais.
    const second = llm.turnRequests[before + 1];
    const lastTwo = second.messages.slice(-2);
    expect(lastTwo[0].role).toBe('assistant');
    expect(JSON.stringify(lastTwo[0].content)).toContain('get_activity_history');
    const toolResult = (lastTwo[1].content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
    expect(toolResult.type).toBe('tool_result');
    expect(String(toolResult.content)).toContain('resume.uploaded');
    // Contexto do turno acompanha a mensagem do candidato; o prompt de sistema é estável.
    expect(JSON.stringify(llm.turnRequests[before].messages.at(-1))).toContain('Candidato: Ana Souza');
    expect(llm.turnRequests[before].system).toEqual(second.system);

    const rows = await prisma.message.findMany({ where: { conversationId }, orderBy: { seq: 'asc' } });
    expect(rows.map((r) => r.kind)).toEqual(['USER_TEXT', 'ASSISTANT', 'TOOL_RESULTS', 'ASSISTANT']);
    const exec = await prisma.actionExecution.findFirstOrThrow({ where: { conversationId } });
    expect(exec).toMatchObject({ toolName: 'get_activity_history', status: 'SUCCEEDED', risk: 'READ_ONLY', userId });
    const usage = await prisma.usageRecord.findMany({ where: { conversationId } });
    expect(usage).toHaveLength(2);
    expect(usage[0].costMicroUsd).toBe(8100); // 1000 entrada, 200 saída, 500 cache (Opus 5.5)

    const view = await agent.get(`/api/conversations/${conversationId}/messages`).expect(200);
    const msgs = view.body as ChatMessageDto[];
    expect(msgs).toHaveLength(2);
    expect(msgs[1].text).toContain('Vou verificar o histórico.');
    expect(msgs[1].tools[0]).toMatchObject({ name: 'get_activity_history', status: 'succeeded' });

    const list = await agent.get('/api/conversations').expect(200);
    expect(list.body[0].title).toBe('O que você fez nas últimas 24 horas?');
  });

  it('entrada inválida e ferramenta inexistente voltam como erro ao modelo, sem executar nada', async () => {
    const { agent } = await registerCandidate(app);
    const conversationId = await newConversation(agent);
    llm.script(
      fakeMessage([toolUse('get_activity_history', { hours: 99999 }), toolUse('search_jobs', { query: 'suporte' })], 'tool_use'),
      fakeMessage([text('Não consegui. A pesquisa de vagas ainda não existe.')], 'end_turn'),
    );
    const n = llm.turnRequests.length;
    const events = await say(agent, conversationId, 'Procure vagas de suporte em Curitiba');

    const finals = events.filter((e) => e.type === 'tool' && e.activity.status !== 'running');
    expect(finals.map((e) => e.type === 'tool' && e.activity.status)).toEqual(['failed', 'failed']);
    const results = llm.turnRequests[n + 1].messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results.every((r) => r.is_error)).toBe(true);
    expect(String(results[1].content)).toContain('Ferramenta desconhecida');
    const execs = await prisma.actionExecution.findMany({ where: { conversationId } });
    expect(execs.every((e) => e.status === 'FAILED')).toBe(true);
  });

  it('atualiza preferências quando o candidato pede, com evento na linha do tempo', async () => {
    const { agent, id: userId } = await registerCandidate(app);
    const conversationId = await newConversation(agent);
    llm.script(
      fakeMessage(
        [toolUse('update_candidate_preferences', { add_constraints: [{ kind: 'NO_WEEKENDS', strength: 'ELIMINATORY' }] })],
        'tool_use',
      ),
      fakeMessage([text('Anotado: nada de fins de semana.')], 'end_turn'),
    );
    await say(agent, conversationId, 'Não quero trabalhar aos finais de semana.');

    const prefs = await prisma.candidatePreferences.findUniqueOrThrow({ where: { userId } });
    expect(prefs.constraints).toEqual([{ kind: 'NO_WEEKENDS', strength: 'ELIMINATORY' }]);
    const exec = await prisma.actionExecution.findFirstOrThrow({ where: { conversationId } });
    expect(exec.risk).toBe('REVERSIBLE');
    const event = await prisma.agentEvent.findFirst({ where: { userId, type: 'preferences.updated_by_agent' } });
    expect(event).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { userId, action: 'agent.tool' } });
    expect(audit).not.toBeNull();
  });

  it('guarda e recupera memórias do candidato', async () => {
    const { agent, id: userId } = await registerCandidate(app);
    const conversationId = await newConversation(agent);
    llm.script(
      fakeMessage([toolUse('save_memory', { kind: 'GOAL', content: 'Quer o primeiro emprego em TI até março' })], 'tool_use'),
      fakeMessage([text('Guardado.')], 'end_turn'),
    );
    await say(agent, conversationId, 'Meu objetivo é conseguir o primeiro emprego em TI até março.');
    const mem = await prisma.agentMemory.findFirstOrThrow({ where: { userId } });
    expect(mem).toMatchObject({ kind: 'GOAL', source: 'CONVERSATION', sourceRef: conversationId });
  });
});

describe('limites e isolamento', () => {
  it('conversa de outro candidato não existe para o intruso', async () => {
    const a = await registerCandidate(app);
    const b = await registerCandidate(app);
    const conversationId = await newConversation(a.agent);
    await b.agent.get(`/api/conversations/${conversationId}/messages`).expect(404);
    await b.agent.post(`/api/conversations/${conversationId}/messages`).send({ text: 'oi' }).expect(404);
    await b.agent.delete(`/api/conversations/${conversationId}`).expect(404);
    expect((await b.agent.get('/api/conversations').expect(200)).body).toEqual([]);
  });

  it('orçamento diário estourado bloqueia a conversa com 429', async () => {
    const { agent, id: userId } = await registerCandidate(app);
    const conversationId = await newConversation(agent);
    await prisma.usageRecord.create({
      data: { userId, route: 'chat', model: 'claude-opus-5-5', inputTokens: 1, outputTokens: 1, costMicroUsd: 50_000_000 },
    });
    const res = await agent.post(`/api/conversations/${conversationId}/messages`).send({ text: 'oi' }).expect(429);
    expect(res.body.message).toContain('Limite de uso de IA');
  });

  it('sem chave configurada responde 503 com mensagem clara', async () => {
    const { agent } = await registerCandidate(app);
    const conversationId = await newConversation(agent);
    llm.configured = false;
    const res = await agent.post(`/api/conversations/${conversationId}/messages`).send({ text: 'oi' }).expect(503);
    expect(res.body.message).toContain('ANTHROPIC_API_KEY');
  });

  it('uma resposta por vez em cada conversa', async () => {
    const { agent } = await registerCandidate(app);
    const conversationId = await newConversation(agent);
    await app.get(RedisService).client.set(`jarvis:chat-lock:${conversationId}`, '1', 'PX', 5000);
    const events = await say(agent, conversationId, 'oi');
    expect(events).toEqual([{ type: 'error', message: 'Já existe uma resposta em andamento nesta conversa.' }]);
  });

  it('mensagem vazia é recusada', async () => {
    const { agent } = await registerCandidate(app);
    const conversationId = await newConversation(agent);
    await agent.post(`/api/conversations/${conversationId}/messages`).send({ text: '   ' }).expect(400);
  });
});

describe('análise de currículo', () => {
  const analysisFixture: ResumeAnalysisLlm = {
    summary: 'Currículo objetivo, com boa base técnica e pouca quantificação de resultados.',
    criteria: [
      { key: 'clarity', score: 50, rationale: 'Seções claras.' },
      { key: 'evidence', score: 90, rationale: 'Atividades descritas.' },
      { key: 'relevance', score: 50, rationale: 'Alinhado em parte.' },
      { key: 'ats', score: 50, rationale: 'Texto selecionável.' },
      { key: 'language', score: 150, rationale: 'Fora da faixa: deve ser recortado para 100.' },
      // 'completeness' ausente de propósito: conta como 0.
    ],
    strengths: ['Projetos em TypeScript'],
    weaknesses: ['Sem resultados mensuráveis'],
    issues: [
      {
        type: 'DESCRICAO_FRACA',
        severity: 'MEDIA',
        excerpt: 'Atendimento a usuarios',
        explanation: 'Não mostra volume nem resultado.',
        suggestion: 'Inclua quantos chamados por dia e o tempo médio de resolução, se souber.',
      },
    ],
    identified: {
      technicalSkills: ['TypeScript', 'React'],
      behavioralSkills: ['Comunicação'],
      languages: [{ name: 'Inglês', level: 'intermediário' }],
      certifications: [],
      education: [{ institution: 'Instituição Exemplo', degree: 'Tecnólogo em ADS', status: 'em andamento' }],
      experiences: [{ company: 'Empresa Exemplo', title: 'Estágio em suporte técnico', period: '2025-03 a 2025-12' }],
    },
    missingInformation: ['LinkedIn ou portfólio'],
    compatibleRoles: [{ role: 'Suporte técnico júnior', reason: 'Experiência direta.' }],
    skillsToDevelop: [{ skill: 'Redes', why: 'Pedido frequente em suporte.' }],
    recommendations: ['Quantifique resultados'],
    limitations: ['Layout visual não avaliado'],
  };

  it('worker analisa com o provedor e o backend calcula a nota pelos pesos públicos', async () => {
    const { agent, id: userId } = await registerCandidate(app);
    await agent.put('/api/profile').send({ fullName: 'Carla', targetRoles: ['Suporte técnico'] }).expect(200);
    const up = await agent.post('/api/resumes').attach('file', makePdf(SAMPLE_RESUME_LINES), 'cv-carla.pdf').expect(201);
    const resumeId = (up.body as ResumeDto).id;
    await waitFor(async () => {
      const r = await agent.get(`/api/resumes/${resumeId}`).expect(200);
      return r.body.status === 'EXTRACTED' ? true : undefined;
    });

    llm.structuredData = analysisFixture;
    const queued = await agent.post(`/api/resumes/${resumeId}/analysis`).expect(202);
    expect((queued.body as ResumeAnalysisDto).status).toBe('QUEUED');

    const done = await waitFor(async () => {
      const r = await agent.get(`/api/resumes/${resumeId}/analysis`).expect(200);
      const a = r.body as ResumeAnalysisDto;
      return a.status === 'SUCCEEDED' || a.status === 'FAILED' ? a : undefined;
    });
    expect(done.status).toBe('SUCCEEDED');
    // (50·20 + 90·25 + 50·20 + 50·15 + 100·10 + 0·10) / 100 = 60
    expect(done.score).toBe(60);
    expect(done.criteria?.find((c) => c.key === 'language')?.score).toBe(100);
    expect(done.criteria?.find((c) => c.key === 'completeness')).toMatchObject({ score: 0, rationale: 'Critério não avaliado.' });
    expect(done.result?.issues[0].type).toBe('DESCRICAO_FRACA');

    const req = llm.structuredRequests.at(-1)!;
    expect(req.userContent).toContain('Cargos pretendidos pelo candidato: Suporte técnico.');
    expect(req.userContent).toContain('<dados_externos origem="curriculo">');
    expect(req.effort).toBe('high');

    expect(await prisma.usageRecord.count({ where: { userId, route: 'resume_analysis' } })).toBe(1);
    expect(await prisma.agentEvent.findFirst({ where: { userId, type: 'resume.analyzed' } })).not.toBeNull();
  });

  it('recusa analisar currículo ainda não lido e currículo de outro candidato', async () => {
    const a = await registerCandidate(app);
    const b = await registerCandidate(app);
    const up = await a.agent.post('/api/resumes').attach('file', makePdf(['Curto']), 'x.pdf').expect(201);
    const resumeId = (up.body as ResumeDto).id;
    await prisma.resume.update({ where: { id: resumeId }, data: { status: 'PROCESSING' } });
    await a.agent.post(`/api/resumes/${resumeId}/analysis`).expect(409);
    await b.agent.post(`/api/resumes/${resumeId}/analysis`).expect(404);
    await b.agent.get(`/api/resumes/${resumeId}/analysis`).expect(404);
  });
});
