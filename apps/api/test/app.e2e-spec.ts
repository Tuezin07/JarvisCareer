import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import type { ResumeDetailDto, ResumeDto } from '@jarvis/shared';
import { PrismaService } from '../src/common/prisma.service.js';
import { makePdf, SAMPLE_RESUME_LINES } from './fixtures/make-pdf.js';
import { createApi, createWorker, PASSWORD, registerCandidate, waitFor } from './helpers.js';

let app: INestApplication;
let worker: INestApplicationContext;
let prisma: PrismaService;

beforeAll(async () => {
  app = await createApi();
  worker = await createWorker();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await worker?.close();
  await app?.close();
});

describe('saúde', () => {
  it('GET /api/health responde com banco e Redis', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up', redis: 'up' });
  });
});

describe('autenticação', () => {
  it('rotas protegidas exigem sessão', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/resumes').expect(401);
  });

  it('registro cria sessão em cookies httpOnly, perfil e consentimentos', async () => {
    const { agent, id } = await registerCandidate(app, 'Ana Souza');
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ id, fullName: 'Ana Souza', role: 'CANDIDATE' });

    const consents = await agent.get('/api/privacy/consents').expect(200);
    expect(consents.body.map((c: { type: string }) => c.type).sort()).toEqual(['PRIVACY', 'TERMS']);
  });

  it('cookies de sessão são httpOnly e o refresh fica restrito a /api/auth', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ fullName: 'Bia', email: `bia-${randomUUID()}@example.com`, password: PASSWORD, acceptTerms: true, acceptPrivacy: true })
      .expect(201);
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.find((c) => c.startsWith('jarvis_at='))).toMatch(/HttpOnly/);
    expect(cookies.find((c) => c.startsWith('jarvis_rt='))).toMatch(/Path=\/api\/auth.*HttpOnly|HttpOnly.*Path=\/api\/auth/);
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('e-mail duplicado retorna 409 e senha errada 401', async () => {
    const { email } = await registerCandidate(app);
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ fullName: 'Outro', email, password: PASSWORD, acceptTerms: true, acceptPrivacy: true })
      .expect(409);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'errada-123456' }).expect(401);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  });

  it('refresh rotaciona o token; reuso fora da janela de graça revoga a família', async () => {
    const { agent, id } = await registerCandidate(app);
    const first = await prisma.refreshToken.findFirstOrThrow({ where: { userId: id } });

    await agent.post('/api/auth/refresh').expect(204);
    const tokens = await prisma.refreshToken.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' } });
    expect(tokens).toHaveLength(2);
    expect(tokens[0].revokedAt).not.toBeNull();
    expect(tokens[1].revokedAt).toBeNull();
    expect(tokens[1].familyId).toBe(first.familyId);

    expect(first.tokenHash).toHaveLength(64); // só o hash SHA-256 fica no banco
  });

  it('reapresentar um refresh já usado, fora da janela de graça, derruba a sessão inteira', async () => {
    const { agent, id } = await registerCandidate(app);
    await agent.post('/api/auth/refresh').expect(204);
    const [old, current] = await prisma.refreshToken.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' } });

    // O token atual (do agente) é envelhecido como se tivesse sido rotacionado há 1 min:
    // apresentá-lo de novo equivale a um atacante usando um token roubado.
    await prisma.refreshToken.update({ where: { id: current.id }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    await agent.post('/api/auth/refresh').expect(401);

    const family = await prisma.refreshToken.findMany({ where: { familyId: old.familyId } });
    expect(family.every((t) => t.revokedAt !== null)).toBe(true);
    const audit = await prisma.auditLog.findFirst({ where: { userId: id, action: 'auth.refresh_reuse_detected' } });
    expect(audit).not.toBeNull();
  });
});

describe('perfil e dashboard', () => {
  it('atualiza perfil, preferências e competências e reflete na completude', async () => {
    const { agent } = await registerCandidate(app, 'Carla Lima');
    const before = await agent.get('/api/dashboard/summary').expect(200);
    expect(before.body.applications).toBeNull();

    await agent
      .put('/api/profile')
      .send({
        fullName: 'Carla Lima',
        phone: '41999990000',
        city: 'Curitiba',
        state: 'PR',
        headline: 'Suporte técnico júnior',
        targetRoles: ['Suporte técnico'],
      })
      .expect(200);
    await agent
      .put('/api/profile/preferences')
      .send({
        workModes: ['HYBRID', 'ONSITE'],
        contractTypes: ['CLT', 'INTERNSHIP'],
        constraints: [
          { kind: 'NO_WEEKENDS', strength: 'ELIMINATORY' },
          { kind: 'MIN_SALARY', strength: 'IMPORTANT', value: 2500 },
        ],
      })
      .expect(200);
    const skills = await agent
      .put('/api/profile/skills')
      .send({ items: [{ name: 'Windows' }, { name: 'windows ' }, { name: 'Redes' }, { name: 'Atendimento', kind: 'BEHAVIORAL' }] })
      .expect(200);
    expect(skills.body.skills).toHaveLength(3); // "Windows" e "windows " são a mesma competência

    const after = await agent.get('/api/dashboard/summary').expect(200);
    expect(after.body.profileCompleteness.percent).toBeGreaterThan(before.body.profileCompleteness.percent);

    await agent.put('/api/profile/preferences').send({ constraints: [{ kind: 'MIN_SALARY', strength: 'IMPORTANT' }] }).expect(400);
  });
});

describe('currículos', () => {
  it('upload de PDF é processado pelo worker e o texto real é extraído', async () => {
    const { agent } = await registerCandidate(app);
    const upload = await agent
      .post('/api/resumes')
      .attach('file', makePdf(SAMPLE_RESUME_LINES), { filename: 'Curriculo Ana.pdf', contentType: 'application/pdf' })
      .expect(201);
    const created = upload.body as ResumeDto;
    expect(created).toMatchObject({ kind: 'pdf', status: 'UPLOADED', isPrimary: true });

    const done = await waitFor(async () => {
      const r = await agent.get(`/api/resumes/${created.id}`).expect(200);
      const body = r.body as ResumeDetailDto;
      return body.status === 'EXTRACTED' || body.status === 'FAILED' ? body : undefined;
    });
    expect(done.status).toBe('EXTRACTED');
    expect(done.pageCount).toBe(1);
    expect(done.extractedText).toContain('TypeScript');

    const events = await agent.get('/api/activity').expect(200);
    expect(events.body.map((e: { type: string }) => e.type)).toEqual(
      expect.arrayContaining(['resume.uploaded', 'resume.extracted']),
    );
    const state = await agent.get('/api/activity/state').expect(200);
    expect(state.body.state).toBe('completed');

    const task = await prisma.agentTask.findFirstOrThrow({ where: { queueJobId: `resume-extract-${created.id}` } });
    expect(task.status).toBe('SUCCEEDED');
  });

  it('recusa arquivo disfarçado, duplicado e grande demais', async () => {
    const { agent } = await registerCandidate(app);
    await agent
      .post('/api/resumes')
      .attach('file', Buffer.from([0x4d, 0x5a, 0x90, 0x00]), { filename: 'cv.pdf', contentType: 'application/pdf' })
      .expect(415);

    const pdf = makePdf(['Unico']);
    await agent.post('/api/resumes').attach('file', pdf, 'a.pdf').expect(201);
    await agent.post('/api/resumes').attach('file', pdf, 'b.pdf').expect(409);

    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024 + 1, 0x20)]);
    await agent.post('/api/resumes').attach('file', big, 'grande.pdf').expect(413);
  });
});

describe('isolamento entre candidatos', () => {
  it('um candidato não lê, altera nem apaga dados de outro', async () => {
    const a = await registerCandidate(app, 'Dono');
    const b = await registerCandidate(app, 'Intruso');

    const up = await a.agent.post('/api/resumes').attach('file', makePdf(['Privado de A']), 'a.pdf').expect(201);
    const id = (up.body as ResumeDto).id;

    await b.agent.get(`/api/resumes/${id}`).expect(404);
    await b.agent.post(`/api/resumes/${id}/primary`).expect(404);
    await b.agent.delete(`/api/resumes/${id}`).expect(404);
    expect((await b.agent.get('/api/resumes').expect(200)).body).toEqual([]);

    const bEvents = await b.agent.get('/api/activity').expect(200);
    expect(JSON.stringify(bEvents.body)).not.toContain('a.pdf');

    await a.agent.get(`/api/resumes/${id}`).expect(200);
  });
});

describe('privacidade (LGPD)', () => {
  it('exporta os dados sem segredos e exclui a conta com os arquivos', async () => {
    const { agent, id } = await registerCandidate(app, 'Eva Titular');
    const up = await agent.post('/api/resumes').attach('file', makePdf(['Eva']), 'eva.pdf').expect(201);
    const resume = await prisma.resume.findUniqueOrThrow({ where: { id: (up.body as ResumeDto).id } });
    const file = resolve(process.env.STORAGE_LOCAL_DIR as string, resume.storageKey);
    await access(file);

    const exp = await agent.get('/api/privacy/export').expect(200);
    expect(exp.headers['content-disposition']).toContain('attachment');
    const text = JSON.stringify(exp.body);
    expect(text).toContain('Eva Titular');
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('storageKey');
    expect(text).not.toContain('tokenHash');

    await agent.post('/api/privacy/consents').send({ type: 'AUTOMATED_APPLICATIONS', granted: true }).expect(200);

    await agent.post('/api/privacy/delete-account').send({ password: 'errada-123456', confirmation: 'EXCLUIR' }).expect(401);
    await agent.post('/api/privacy/delete-account').send({ password: PASSWORD, confirmation: 'excluir' }).expect(400);
    await agent.post('/api/privacy/delete-account').send({ password: PASSWORD, confirmation: 'EXCLUIR' }).expect(204);

    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.resume.count({ where: { userId: id } })).toBe(0);
    await expect(access(file)).rejects.toThrow();
    const audit = await prisma.auditLog.findFirst({ where: { userId: id, action: 'account.deleted' } });
    expect(audit).not.toBeNull();
  });
});
