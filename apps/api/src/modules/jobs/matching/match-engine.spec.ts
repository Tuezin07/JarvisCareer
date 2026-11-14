import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH_WEIGHTS } from '@jarvis/shared';
import { detectFraudSignals } from './fraud-signals.js';
import { type CandidateSnapshot, computeMatch, hasTerm, type JobForMatch, jobLevel } from './match-engine.js';

const candidate = (over: Partial<CandidateSnapshot> = {}): CandidateSnapshot => ({
  targetRoles: ['Suporte técnico', 'Desenvolvedor júnior'],
  headline: null,
  city: 'Curitiba',
  state: 'PR',
  regionsOfInterest: [],
  skills: ['Windows', 'Redes', 'TypeScript', 'React', 'Atendimento ao cliente'],
  experienceMonths: 10,
  education: [{ degree: 'Tecnólogo em ADS', status: 'IN_PROGRESS' }],
  workModes: ['REMOTE', 'HYBRID'],
  contractTypes: ['CLT', 'INTERNSHIP'],
  schedules: ['FULL_TIME'],
  salaryExpectation: 2500,
  acceptsNoExperience: true,
  constraints: [],
  ...over,
});

const job = (over: Partial<JobForMatch> = {}): JobForMatch => ({
  title: 'Analista de Suporte Técnico Júnior',
  department: 'Tecnologia',
  locations: ['Curitiba, Parana, Brasil'],
  workplaceType: 'HYBRID',
  employmentType: null,
  description:
    'Atendimento a usuários internos, suporte técnico em Windows e redes. Contratação CLT. Salário R$ 3.200. ' +
    'Jornada de segunda a sexta. Cursando ensino superior em TI. Desejável conhecimento em Active Directory.' +
    ' '.repeat(200),
  salary: null,
  ...over,
});

describe('hasTerm', () => {
  it('casa termos inteiros, inclusive com símbolos', () => {
    expect(hasTerm('experiencia com c# e .net', 'C#')).toBe(true);
    expect(hasTerm('experiencia com c# e .net', '.NET')).toBe(true);
    expect(hasTerm('javascript moderno', 'java')).toBe(false);
    expect(hasTerm('node.js e react', 'Node.js')).toBe(true);
  });
});

describe('jobLevel', () => {
  it('reconhece níveis pelo título', () => {
    expect(jobLevel('Estágio em Dados', null)).toBe('ENTRY');
    expect(jobLevel('Desenvolvedor Pleno', null)).toBe('MID');
    expect(jobLevel('Senior Software Engineer', null)).toBe('SENIOR');
    expect(jobLevel('Engineering Manager', null)).toBe('LEAD');
    expect(jobLevel('Analista de Dados', 'Internship')).toBe('ENTRY');
    expect(jobLevel('Analista de Dados', null)).toBeNull();
    expect(jobLevel('Data Scientist III', null)).toBe('SENIOR');
    expect(jobLevel('Data Engineer II', null)).toBe('MID');
  });
});

describe('computeMatch', () => {
  it('vaga alinhada recebe nota alta, com explicação por critério', () => {
    const r = computeMatch(candidate(), job());
    expect(r.eliminated).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.breakdown.criteria.map((c) => c.key)).toEqual(Object.keys(DEFAULT_MATCH_WEIGHTS));
    expect(r.breakdown.matchedSkills).toEqual(expect.arrayContaining(['Windows', 'Redes']));
    expect(r.breakdown.missingSkills).toContain('Active Directory');
    expect(r.breakdown.met.some((m) => m.includes('Curitiba'))).toBe(true);
  });

  it('vaga sênior distante do perfil recebe nota baixa', () => {
    const r = computeMatch(
      candidate(),
      job({
        title: 'Senior Staff Engineer - Kubernetes',
        locations: ['Berlin, Germany'],
        workplaceType: 'ONSITE',
        description: 'We need 8+ years of experience with Kubernetes, Go (golang), Terraform and AWS. Bachelor degree in CS.' + ' '.repeat(300),
      }),
    );
    expect(r.score).toBeLessThan(35);
  });

  it('vaga sênior sem anos informados usa estimativa declarada e não favorece quem não tem experiência', () => {
    const novice = candidate({ experienceMonths: 0, skills: ['Python', 'SQL'] });
    const senior = job({
      title: 'Data Scientist III',
      workplaceType: 'REMOTE',
      locations: ['Remoto'],
      description: 'Modelagem com Python e SQL para crédito.' + ' '.repeat(300),
    });
    const r = computeMatch(novice, senior);
    const exp = r.breakdown.criteria.find((c) => c.key === 'experience')!;
    expect(exp.score).toBe(0);
    expect(exp.detail).toContain('estimativa');
    expect(r.score).toBeLessThan(50);
  });

  it('restrição eliminatória com evidência elimina; sem evidência vira pergunta', () => {
    const noWeekends = candidate({ constraints: [{ kind: 'NO_WEEKENDS', strength: 'ELIMINATORY' }] });
    const scale = computeMatch(noWeekends, job({ description: 'Atendimento em loja, escala 6x1 com trabalho aos sábados.' }));
    expect(scale.eliminated).toBe(true);
    expect(scale.breakdown.eliminatedReasons[0]).toContain('fim de semana');

    const silent = computeMatch(noWeekends, job({ description: 'Atendimento ao cliente em loja.' }));
    expect(silent.eliminated).toBe(false);
    expect(silent.breakdown.questions).toContain('A jornada inclui fins de semana?');

    const weekdays = computeMatch(noWeekends, job());
    expect(weekdays.eliminated).toBe(false);
  });

  it('salário mínimo só elimina quando o salário é conhecido', () => {
    const min = candidate({ constraints: [{ kind: 'MIN_SALARY', strength: 'ELIMINATORY', value: 4000 }] });
    expect(computeMatch(min, job()).eliminated).toBe(true); // R$ 3.200 no texto
    const unknown = computeMatch(min, job({ description: 'Suporte técnico em Windows.' }));
    expect(unknown.eliminated).toBe(false);
    expect(unknown.breakdown.questions).toContain('Qual a faixa salarial?');
  });

  it('salário anual em moeda estrangeira não é comparado com reais', () => {
    const r = computeMatch(candidate(), job({ salary: { min: 90000, max: 120000, currency: 'USD', period: 'YEAR' } }));
    expect(r.breakdown.limitations.some((l) => l.includes('USD'))).toBe(true);
  });

  it('restrição importante penaliza sem eliminar', () => {
    const base = computeMatch(candidate(), job({ workplaceType: 'ONSITE' }));
    const penalized = computeMatch(candidate({ constraints: [{ kind: 'NO_ONSITE', strength: 'IMPORTANT' }] }), job({ workplaceType: 'ONSITE' }));
    expect(penalized.eliminated).toBe(false);
    expect(penalized.score).toBe(Math.max(0, base.score - 15));
  });

  it('remoto atende restrição de regiões; presencial fora das regiões elimina', () => {
    const regions = candidate({ constraints: [{ kind: 'ONLY_REGIONS', strength: 'ELIMINATORY', regions: ['Curitiba'] }] });
    expect(computeMatch(regions, job({ workplaceType: 'REMOTE', locations: ['Brasil'] })).eliminated).toBe(false);
    expect(computeMatch(regions, job({ workplaceType: 'ONSITE', locations: ['São Paulo, SP'] })).eliminated).toBe(true);
  });

  it('área excluída olha o título, não qualquer menção', () => {
    const excl = candidate({ constraints: [{ kind: 'EXCLUDED_AREA', strength: 'ELIMINATORY', area: 'Telemarketing' }] });
    expect(computeMatch(excl, job({ title: 'Operador de Telemarketing' })).eliminated).toBe(true);
    expect(computeMatch(excl, job({ description: 'Não é telemarketing.' })).eliminated).toBe(false);
  });

  it('pesos configuráveis mudam a nota', () => {
    const allSkills = { skills: 100, experience: 0, role: 0, seniority: 0, location: 0, education: 0, compensation: 0 };
    const r = computeMatch(candidate(), job(), allSkills);
    expect(r.score).toBe(r.breakdown.criteria.find((c) => c.key === 'skills')!.score);
  });
});

describe('detectFraudSignals', () => {
  it('vaga normal é risco baixo', () => {
    expect(detectFraudSignals('Analista de Suporte', 'Atendimento a usuários. Contratação CLT.').risk).toBe('LOW');
  });

  it('pedido de pagamento é crítico, com evidência', () => {
    const r = detectFraudSignals('Digitador home office', 'Ganhe bem! Pague uma taxa de inscrição de R$ 50 via pix para cadastro.');
    expect(r.risk).toBe('CRITICAL');
    expect(r.signals[0].code).toBe('PAYMENT_REQUEST');
    expect(r.signals[0].evidence).toContain('taxa de inscricao');
  });

  it('pedido de CPF e contato por WhatsApp elevam o risco', () => {
    const r = detectFraudSignals('Vaga', 'Envie seu CPF e RG. Chame no WhatsApp (11) 99999-0000.');
    expect(r.risk).toBe('HIGH');
    expect(r.signals.map((s) => s.code)).toEqual(['SENSITIVE_DATA_REQUEST', 'OFF_PLATFORM_CONTACT']);
  });
});
