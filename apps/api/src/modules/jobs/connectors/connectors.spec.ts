import { describe, expect, it } from 'vitest';
import {
  ASHBY_JOB_ID,
  ASHBY_JOBS,
  ashbyBoard,
  FakeJobHttp,
  GH_BOARD,
  GH_JOBS,
  ghBoard,
  ghJobs,
  LEVER_JOB_ID,
  LEVER_JOBS,
  leverPostings,
} from '../../../../test/fixtures/job-boards.js';
import { experienceMonths } from '../matching/matching.service.js';
import { contentHash, dedupKey } from '../sync.service.js';
import { AshbyConnector } from './ashby.connector.js';
import { GreenhouseConnector } from './greenhouse.connector.js';
import { ALLOWED_HOSTS, FetchJobHttp } from './job-http.js';
import { LeverConnector } from './lever.connector.js';
import { parseJobUrl } from './source-url.js';
import { htmlToText } from './text.js';
import { BoardNotFoundError } from './types.js';

describe('parseJobUrl', () => {
  it('reconhece páginas e vagas dos três ATS', () => {
    expect(parseJobUrl('https://job-boards.greenhouse.io/stone')).toMatchObject({ provider: 'GREENHOUSE', boardToken: 'stone', externalId: null });
    expect(parseJobUrl('boards.greenhouse.io/stone/jobs/8044838003')).toMatchObject({ boardToken: 'stone', externalId: '8044838003' });
    expect(parseJobUrl('https://boards.greenhouse.io/embed/job_board?for=acme')).toMatchObject({ boardToken: 'acme' });
    expect(parseJobUrl(`https://jobs.lever.co/globex/${LEVER_JOB_ID}`)).toMatchObject({ provider: 'LEVER', externalId: LEVER_JOB_ID });
    expect(parseJobUrl('https://jobs.eu.lever.co/globex')).toMatchObject({ provider: 'LEVER', region: 'eu' });
    expect(parseJobUrl(`https://jobs.ashbyhq.com/initech/${ASHBY_JOB_ID}`)).toMatchObject({ provider: 'ASHBY', externalId: ASHBY_JOB_ID });
    expect(parseJobUrl('greenhouse:acme')).toMatchObject({ provider: 'GREENHOUSE', boardToken: 'acme' });
  });

  it('recusa portais não suportados e entradas malformadas', () => {
    expect(parseJobUrl('https://www.linkedin.com/jobs/view/123')).toBeNull();
    expect(parseJobUrl('https://portal.gupy.io/job/123')).toBeNull();
    expect(parseJobUrl('https://job-boards.greenhouse.io/')).toBeNull();
    expect(parseJobUrl('https://evil.example/job-boards.greenhouse.io/acme')).toBeNull();
    expect(parseJobUrl('https://job-boards.greenhouse.io.evil.example/acme')).toBeNull();
    expect(parseJobUrl('javascript:alert(1)')).toBeNull();
    expect(parseJobUrl('greenhouse:a b')).toBeNull();
  });
});

describe('htmlToText', () => {
  it('decodifica o HTML escapado do Greenhouse e preserva listas', () => {
    const text = htmlToText('&lt;p&gt;Olá &amp;amp; bem-vindo&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Item 1&lt;/li&gt;&lt;li&gt;Item 2&lt;/li&gt;&lt;/ul&gt;');
    expect(text).toContain('Olá & bem-vindo');
    expect(text).toContain('• Item 1');
    expect(text).toContain('• Item 2');
  });

  it('descarta scripts e estilos', () => {
    expect(htmlToText('<p>ok</p><script>alert(1)</script><style>p{}</style>')).toBe('ok');
  });
});

describe('conectores', () => {
  it('Greenhouse: normaliza vagas e nome da empresa', async () => {
    const http = new FakeJobHttp().set(GH_BOARD, ghBoard).set(GH_JOBS, ghJobs());
    const c = new GreenhouseConnector(http);
    const ref = { provider: 'GREENHOUSE' as const, boardToken: 'acme', region: null };
    expect(await c.board(ref)).toEqual({ companyName: 'Acme Tecnologia', careersUrl: 'https://job-boards.greenhouse.io/acme' });
    const jobs = await c.jobs(ref);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      externalId: '101',
      department: 'Tecnologia',
      locations: ['Curitiba, Parana, Brasil'],
      language: 'pt',
      url: 'https://job-boards.greenhouse.io/acme/jobs/101',
    });
    expect(jobs[0].description).toContain('Windows');
    expect(jobs[0].description).not.toContain('&lt;');
    expect(jobs[2].workplaceType).toBe('REMOTE');
  });

  it('Lever: usa workplaceType, commitment, listas e faixa salarial', async () => {
    const c = new LeverConnector(new FakeJobHttp().set(LEVER_JOBS, leverPostings()));
    const [j] = await c.jobs({ provider: 'LEVER', boardToken: 'globex', region: null });
    expect(j).toMatchObject({
      externalId: LEVER_JOB_ID,
      workplaceType: 'REMOTE',
      employmentType: 'Full-time',
      department: 'Engenharia',
      salary: { min: 48000, max: 60000, currency: 'BRL', period: 'YEAR' },
    });
    expect(j.description).toContain('React');
    expect(j.description).toContain('Contratação CLT');
  });

  it('Ashby: ignora vagas não listadas e lê o salário estruturado', async () => {
    const c = new AshbyConnector(new FakeJobHttp().set(ASHBY_JOBS, ashbyBoard()));
    const jobs = await c.jobs({ provider: 'ASHBY', boardToken: 'initech', region: null });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      workplaceType: 'HYBRID',
      locations: ['São Paulo', 'Remote - Brazil'],
      employmentType: 'FullTime',
      salary: { min: 30000, max: 40000, currency: 'USD', period: 'YEAR' },
    });
  });

  it('página inexistente vira BoardNotFoundError', async () => {
    const c = new GreenhouseConnector(new FakeJobHttp());
    await expect(c.board({ provider: 'GREENHOUSE', boardToken: 'nada', region: null })).rejects.toBeInstanceOf(BoardNotFoundError);
  });

  it('cliente HTTP só chama hosts permitidos', async () => {
    expect(ALLOWED_HOSTS.has('api.lever.co')).toBe(true);
    await expect(new FetchJobHttp().getJson('https://169.254.169.254/latest/meta-data')).rejects.toThrow('Host não permitido');
    await expect(new FetchJobHttp().getJson('http://api.lever.co/v0/postings/x')).rejects.toThrow('Host não permitido');
  });
});

describe('sincronização', () => {
  it('hash muda quando o conteúdo muda; chave de duplicidade ignora acentos e caixa', async () => {
    const [a] = await new GreenhouseConnector(new FakeJobHttp().set(GH_JOBS, ghJobs())).jobs({ provider: 'GREENHOUSE', boardToken: 'acme', region: null });
    expect(contentHash(a)).toBe(contentHash({ ...a }));
    expect(contentHash(a)).not.toBe(contentHash({ ...a, description: `${a.description} novo` }));
    expect(dedupKey('Acme Tecnologia', a)).toBe(dedupKey('ACME tecnologia', { ...a, title: 'ANALISTA DE SUPORTE TECNICO JUNIOR' }));
  });

  it('experiência soma períodos sem contar sobreposição duas vezes', () => {
    const now = new Date('2026-12-15T00:00:00Z');
    expect(experienceMonths([{ startMonth: '2026-01', endMonth: '2026-06' }], now)).toBe(6);
    expect(
      experienceMonths(
        [
          { startMonth: '2026-01', endMonth: '2026-06' },
          { startMonth: '2026-04', endMonth: '2026-09' },
        ],
        now,
      ),
    ).toBe(9);
    expect(experienceMonths([{ startMonth: '2026-11', endMonth: null }], now)).toBe(2);
  });
});
