import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AutomationTask } from '@jarvis/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestSite } from '../test-site/server.ts';
import { runTask } from './run-task.ts';

/** Executor real (Chromium do Playwright) contra o site de testes controlado. */
const PORT = 4199;
const SITE = `127.0.0.1:${PORT}`;
let server: Server;

beforeAll(async () => {
  server = await startTestSite(PORT);
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const cfg = { provider: 'local' as const, headless: true, allowLoopback: new Set([SITE]), browserbaseApiKey: null, browserbaseProjectId: null };
const deps = (cancelled = false) => ({ cfg, isCancelled: async () => cancelled, resolve: async () => ['93.184.216.34'] });

const task = (over: Partial<AutomationTask> = {}): AutomationTask => ({
  version: 1,
  sessionId: randomUUID(),
  userId: randomUUID(),
  kind: 'INSPECT_PAGE',
  targetUrl: `http://${SITE}/vagas/42/aplicar`,
  navigationAllowlist: ['example.com'],
  captureScreenshots: true,
  profile: { fullName: 'Ana Souza', firstName: 'Ana', lastName: 'Souza', email: 'ana@example.com', phone: '41999990000', city: 'Curitiba', state: 'PR' },
  limits: { timeoutMs: 60_000, maxSteps: 30 },
  ...over,
});

const pdf = Buffer.from('%PDF-1.4\n%teste\n').toString('base64');

describe('INSPECT_PAGE', () => {
  it('descreve o formulário e mapeia o que dá para preencher, sem preencher nada', async () => {
    const r = await runTask(task(), deps());
    expect(r.status).toBe('SUCCEEDED');
    expect(r.title).toContain('Candidatura');
    const byLabel = Object.fromEntries(r.mapping.map((m) => [m.label, m]));
    expect(byLabel['Nome']).toMatchObject({ status: 'AUTO', source: 'perfil.nome', required: true });
    expect(byLabel['Sobrenome'].source).toBe('perfil.sobrenome');
    expect(byLabel['E-mail'].source).toBe('perfil.email');
    expect(byLabel['Currículo (PDF ou DOCX)']).toMatchObject({ type: 'file', status: 'NEEDS_HUMAN' }); // sem currículo na tarefa
    expect(byLabel['Por que você quer trabalhar na Empresa Exemplo?']).toMatchObject({ status: 'NEEDS_HUMAN' });
    expect(byLabel['Gênero (opcional)'].status).toBe('SKIPPED');
    expect(r.mapping.find((m) => m.type === 'checkbox')!.reason).toContain('Consentimento');
    expect(r.steps.some((s) => s.action === 'fill')).toBe(false);
    expect(r.screenshots).toHaveLength(1);
    expect(r.screenshots[0].base64.length).toBeGreaterThan(1000);
  });

  it('formulário no estilo ATS: agrupa perguntas, ignora inputs auxiliares e acha o rótulo do anexo', async () => {
    const r = await runTask(task({ targetUrl: `http://${SITE}/vagas/77/aplicar` }), deps());
    expect(r.status).toBe('SUCCEEDED');
    const byLabel = Object.fromEntries(r.mapping.map((m) => [m.label, m]));
    expect(r.mapping.some((m) => m.label === '(sem rótulo)')).toBe(false); // input oculto da lista de sugestões
    expect(byLabel['Nome']).toMatchObject({ status: 'AUTO', source: 'perfil.nome' });
    expect(byLabel['Localização (Cidade)']).toMatchObject({ type: 'combobox', status: 'AUTO' });
    expect(byLabel['Currículo/CV']).toMatchObject({ type: 'file', status: 'NEEDS_HUMAN' }); // sem currículo na tarefa
    expect(byLabel['Carta de apresentação']).toMatchObject({ type: 'file', status: 'SKIPPED' });
    expect(byLabel['Como você conheceu a Empresa Exemplo?']).toMatchObject({
      type: 'checkbox-group',
      required: true,
      status: 'NEEDS_HUMAN',
      options: ['Redes sociais', 'Indicação de amigos', 'Outro'],
    });
    expect(byLabel['Qual sua pretensão salarial?'].reason).toContain('Pretensão salarial');
    expect(byLabel['Você aceita trabalho remoto?']).toMatchObject({ type: 'radio-group', options: ['Sim', 'Não'] });
    expect(byLabel['Caso seja indicação, informe o e-mail corporativo da pessoa que te indicou.']).toMatchObject({ status: 'SKIPPED', source: null });
    expect(byLabel['Nome da empresa atual'].source).toBeNull();
    expect(byLabel['Qual é o seu CPF?'].reason).toContain('Documento pessoal');
    expect(byLabel['Eu concordo com o uso destes dados para o processo seletivo.'].status).toBe('NEEDS_HUMAN');
    expect(r.mapping).toHaveLength(14);
  });

  it('detecta CAPTCHA e login e não tenta contornar', async () => {
    const captcha = await runTask(task({ targetUrl: `http://${SITE}/captcha` }), deps());
    expect(captcha.blockers.map((b) => b.kind)).toContain('CAPTCHA');
    const login = await runTask(task({ targetUrl: `http://${SITE}/login` }), deps());
    expect(login.blockers.map((b) => b.kind)).toContain('LOGIN');
    expect(login.mapping.find((m) => m.type === 'password')!.status).toBe('NEEDS_HUMAN');
  });

  it('redirecionamento para metadados de nuvem é barrado pela política', async () => {
    const r = await runTask(task({ targetUrl: `http://${SITE}/redirect-privado` }), deps());
    expect(r.status).toBe('BLOCKED');
    expect(r.blockedRequests[0]).toContain('169.254.169.254');
  });

  it('redirecionamento para fora da allowlist é barrado', async () => {
    const r = await runTask(task({ targetUrl: `http://${SITE}/redirect-externo`, navigationAllowlist: ['greenhouse.io'] }), deps());
    expect(r.status).toBe('BLOCKED');
    expect(r.blockedRequests[0]).toContain('allowlist');
  });

  it('recursos da página apontando para a rede interna são barrados', async () => {
    const r = await runTask(task({ targetUrl: `http://${SITE}/vazamento` }), deps());
    expect(r.status).toBe('SUCCEEDED');
    expect(r.blockedRequests.join(' ')).toContain('127.0.0.1:5433');
    expect(r.blockedRequests.join(' ')).toContain('10.0.0.1');
  });

  it('sem consentimento para capturas, nenhuma imagem é gerada', async () => {
    const r = await runTask(task({ captureScreenshots: false }), deps());
    expect(r.screenshots).toHaveLength(0);
  });
});

describe('FILL_TEST_FORM', () => {
  it('preenche só campos verificáveis, anexa o currículo e para antes de enviar', async () => {
    const r = await runTask(
      task({ kind: 'FILL_TEST_FORM', resume: { fileName: 'curriculo.pdf', mimeType: 'application/pdf', base64: pdf } }),
      deps(),
    );
    expect(r.status).toBe('WAITING_HUMAN');
    const fills = r.steps.filter((s) => s.action === 'fill');
    expect(fills.map((s) => s.target)).toEqual(['Nome', 'Sobrenome', 'E-mail', 'Telefone', 'Cidade', 'Currículo (PDF ou DOCX)']);
    expect(fills.every((s) => s.status === 'OK')).toBe(true);
    expect(r.steps.some((s) => /submit|enviar/i.test(s.action))).toBe(false);
    expect(r.finalUrl).toContain('/vagas/42/aplicar'); // não navegou para a confirmação
    expect(r.screenshots.map((s) => s.label)).toEqual(['Página aberta', 'Formulário preenchido (não enviado)']);
  });

  it('recusa preencher fora do site de testes', async () => {
    const r = await runTask(task({ kind: 'FILL_TEST_FORM', targetUrl: 'https://job-boards.greenhouse.io/acme/jobs/1' }), deps());
    expect(r.status).toBe('BLOCKED');
    expect(r.error).toContain('site de testes');
    expect(r.steps).toHaveLength(0);
  });
});

describe('controle', () => {
  it('cancelamento interrompe antes de abrir o navegador', async () => {
    const r = await runTask(task(), deps(true));
    expect(r.status).toBe('CANCELLED');
    expect(r.steps).toHaveLength(0);
  });

  it('limite de passos encerra a tarefa', async () => {
    const r = await runTask(task({ limits: { timeoutMs: 60_000, maxSteps: 2 } }), deps());
    expect(r.status).toBe('FAILED');
    expect(r.error).toContain('Limite de 2 passos');
  });
});
