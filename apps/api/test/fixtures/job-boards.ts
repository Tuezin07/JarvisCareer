/**
 * Respostas sintéticas no formato real das APIs públicas (verificado em 2026-11-12 contra
 * boards-api.greenhouse.io, api.lever.co e api.ashbyhq.com). Empresas e vagas são fictícias.
 */
export const GH_BOARD = 'https://boards-api.greenhouse.io/v1/boards/acme';
export const GH_JOBS = `${GH_BOARD}/jobs?content=true`;
export const LEVER_JOBS = 'https://api.lever.co/v0/postings/globex?mode=json';
export const LEVER_BOARD = 'https://api.lever.co/v0/postings/globex?mode=json&limit=1';
export const ASHBY_JOBS = 'https://api.ashbyhq.com/posting-api/job-board/initech?includeCompensation=true';

export const LEVER_JOB_ID = '0f8fbb1c-1a2b-4c3d-8e9f-001122334455';
export const ASHBY_JOB_ID = '7a9e1c2d-3b4c-4d5e-8f6a-112233445566';

export const ghBoard = { name: 'Acme Tecnologia', content: '' };

export const ghJob = (id: number, title: string, html: string, location: string) => ({
  id,
  title,
  absolute_url: `https://job-boards.greenhouse.io/acme/jobs/${id}`,
  internal_job_id: id * 10,
  updated_at: '2026-11-05T13:55:12-03:00',
  first_published: '2026-11-01T10:00:00-03:00',
  language: 'pt',
  requisition_id: `R${id}`,
  company_name: 'Acme Tecnologia',
  // A API real entrega o HTML escapado.
  content: html.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  location: { name: location },
  departments: [{ id: 1, name: 'Tecnologia', child_ids: [], parent_id: null }],
  offices: [{ id: 2, name: 'TIME INTERNO', location: null, child_ids: [], parent_id: null }],
  metadata: [],
});

export const ghJobs = () => ({
  jobs: [
    ghJob(
      101,
      'Analista de Suporte Técnico Júnior',
      '<div><p>Suporte técnico a usuários em <strong>Windows</strong> e redes.</p><ul><li>Contratação CLT</li><li>De segunda a sexta</li></ul><p>Salário R$ 3.000.</p></div>',
      'Curitiba, Parana, Brasil',
    ),
    ghJob(
      102,
      'Operador de Loja',
      '<p>Atendimento ao cliente em loja física, escala 6x1 com trabalho aos sábados e domingos.</p>',
      'Curitiba, Parana, Brasil',
    ),
    ghJob(103, 'Senior Data Engineer', '<p>We need 8+ years of experience with Spark, Kubernetes and AWS.</p>', 'Remote - Brazil'),
  ],
  meta: { total: 3 },
});

export const leverPostings = () => [
  {
    id: LEVER_JOB_ID,
    text: 'Desenvolvedor Júnior React',
    hostedUrl: `https://jobs.lever.co/globex/${LEVER_JOB_ID}`,
    applyUrl: `https://jobs.lever.co/globex/${LEVER_JOB_ID}/apply`,
    createdAt: 1792767640768,
    country: 'BR',
    workplaceType: 'remote',
    categories: { commitment: 'Full-time', department: 'Engenharia', team: 'Web', location: 'Remoto, Brasil', allLocations: ['Remoto, Brasil'] },
    descriptionPlain: 'Buscamos pessoa desenvolvedora júnior para o time web.',
    description: '<div>Buscamos pessoa desenvolvedora júnior para o time web.</div>',
    lists: [{ text: 'Requisitos', content: '<li>React</li><li>TypeScript</li><li>Git</li>' }],
    additionalPlain: 'Contratação CLT.',
    additional: '<div>Contratação CLT.</div>',
    salaryRange: { min: 48000, max: 60000, currency: 'BRL', interval: 'per-year-salary' },
  },
];

export const ashbyBoard = () => ({
  apiVersion: '1',
  jobs: [
    {
      id: ASHBY_JOB_ID,
      title: 'Customer Support Specialist',
      department: 'Support',
      team: 'LatAm',
      employmentType: 'FullTime',
      location: 'São Paulo',
      secondaryLocations: [{ location: 'Remote - Brazil', address: { postalAddress: { addressCountry: 'Brazil' } } }],
      isListed: true,
      isRemote: false,
      workplaceType: 'Hybrid',
      descriptionPlain: 'Help customers via chat and email. English required.',
      jobUrl: `https://jobs.ashbyhq.com/initech/${ASHBY_JOB_ID}`,
      applyUrl: `https://jobs.ashbyhq.com/initech/${ASHBY_JOB_ID}/application`,
      publishedAt: '2026-10-30T12:00:00.000+00:00',
      compensation: {
        compensationTiers: [
          {
            components: [
              { compensationType: 'EquityPercentage', interval: '1 YEAR', currencyCode: null, minValue: null, maxValue: null },
              { compensationType: 'Salary', interval: '1 YEAR', currencyCode: 'USD', minValue: 30000, maxValue: 40000 },
            ],
          },
        ],
      },
    },
    { id: 'hidden', title: 'Vaga oculta', isListed: false, jobUrl: 'https://jobs.ashbyhq.com/initech/hidden' },
  ],
});

/** JobHttp falso: responde por URL exata; o resto é 404. */
export class FakeJobHttp {
  readonly calls: string[] = [];
  routes = new Map<string, unknown>();

  set(url: string, body: unknown) {
    this.routes.set(url, body);
    return this;
  }

  async getJson<T>(url: string): Promise<T | null> {
    this.calls.push(url);
    return (this.routes.has(url) ? structuredClone(this.routes.get(url)) : null) as T | null;
  }
}
