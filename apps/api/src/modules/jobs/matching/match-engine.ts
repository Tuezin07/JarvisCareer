import {
  type Constraint,
  DEFAULT_MATCH_WEIGHTS,
  MATCH_CRITERIA,
  type MatchBreakdown,
  type MatchCriterionKey,
  type MatchCriterionResult,
  type MatchWeights,
  type WorkplaceType,
} from '@jarvis/shared';
import { normalize } from '../connectors/text.js';
import { SKILL_DICTIONARY } from './skills-dictionary.js';

type ContractKind = 'CLT' | 'PJ' | 'INTERNSHIP' | 'APPRENTICE' | 'FREELANCE' | 'TEMPORARY';

export interface CandidateSnapshot {
  targetRoles: string[];
  headline: string | null;
  city: string | null;
  state: string | null;
  regionsOfInterest: string[];
  skills: string[];
  experienceMonths: number;
  education: Array<{ degree: string; status: 'COMPLETED' | 'IN_PROGRESS' | 'INCOMPLETE' }>;
  workModes: Array<'REMOTE' | 'HYBRID' | 'ONSITE'>;
  contractTypes: ContractKind[];
  schedules: Array<'FULL_TIME' | 'PART_TIME'>;
  salaryExpectation: number | null;
  acceptsNoExperience: boolean;
  constraints: Constraint[];
}

export interface JobForMatch {
  title: string;
  department: string | null;
  locations: string[];
  workplaceType: WorkplaceType;
  employmentType: string | null;
  description: string;
  salary: { min: number | null; max: number | null; currency: string | null; period: string | null } | null;
}

export interface MatchResult {
  score: number;
  eliminated: boolean;
  breakdown: MatchBreakdown;
}

const UF_NAMES: Record<string, string> = {
  AC: 'acre', AL: 'alagoas', AP: 'amapa', AM: 'amazonas', BA: 'bahia', CE: 'ceara', DF: 'distrito federal',
  ES: 'espirito santo', GO: 'goias', MA: 'maranhao', MT: 'mato grosso', MS: 'mato grosso do sul', MG: 'minas gerais',
  PA: 'para', PB: 'paraiba', PR: 'parana', PE: 'pernambuco', PI: 'piaui', RJ: 'rio de janeiro', RN: 'rio grande do norte',
  RS: 'rio grande do sul', RO: 'rondonia', RR: 'roraima', SC: 'santa catarina', SP: 'sao paulo', SE: 'sergipe', TO: 'tocantins',
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Termo inteiro no texto normalizado (funciona para "c#", ".net", "node.js"). */
export function hasTerm(normText: string, term: string): boolean {
  const t = normalize(term);
  if (!t) return false;
  return new RegExp(`(?<![a-z0-9])${escapeRe(t)}(?![a-z0-9])`).test(normText);
}

// ───────────── Senioridade ─────────────

const LEVELS = ['ENTRY', 'JUNIOR', 'MID', 'SENIOR', 'LEAD'] as const;
type Level = (typeof LEVELS)[number];
const LEVEL_LABEL: Record<Level, string> = {
  ENTRY: 'estágio/aprendiz',
  JUNIOR: 'júnior',
  MID: 'pleno',
  SENIOR: 'sênior',
  LEAD: 'liderança/especialista',
};

export function jobLevel(title: string, employmentType: string | null): Level | null {
  const t = normalize(`${title} ${employmentType ?? ''}`);
  if (/\b(estagio|estagiari[oa]|intern|internship|trainee|jovem aprendiz|aprendiz|apprentice)\b/.test(t)) return 'ENTRY';
  if (/\b(junior|jr)\b/.test(t)) return 'JUNIOR';
  if (/\b(senior|sr)\b/.test(t)) return 'SENIOR';
  if (/\b(pleno|mid-level|mid level)\b/.test(t)) return 'MID';
  if (/\b(especialista|specialist|staff|principal|lead|lider|head|coordenador[a]?|coordinator|gerente|manager|diretor[a]?|director|vp)\b/.test(t)) {
    return 'LEAD';
  }
  // Escadas numeradas ("Data Scientist III"): só no título, onde não confundem com texto corrido.
  if (/\b(iii|iv)\b/.test(normalize(title))) return 'SENIOR';
  if (/\bii\b/.test(normalize(title))) return 'MID';
  return null;
}

/** Nível da vaga 2+ degraus acima do histórico do candidato limita a nota final. */
export const SENIORITY_GAP_CAP = 45;

/** Anos que o nível costuma exigir quando a vaga não informa. Usado só como estimativa declarada. */
const TYPICAL_YEARS: Partial<Record<Level, number>> = { MID: 2, SENIOR: 5, LEAD: 7 };

function candidateLevel(months: number): Level {
  if (months < 6) return 'ENTRY';
  if (months < 24) return 'JUNIOR';
  if (months < 60) return 'MID';
  if (months < 96) return 'SENIOR';
  return 'LEAD';
}

// ───────────── Contrato e salário ─────────────

function jobContracts(text: string, employmentType: string | null, level: Level | null): Set<ContractKind> {
  const t = text;
  const et = normalize(employmentType ?? '').replace(/[^a-z]/g, '');
  const out = new Set<ContractKind>();
  if (/\bclt\b/.test(t)) out.add('CLT');
  if (/\b(pj|pessoa juridica)\b/.test(t) || et === 'contract' || et === 'contractor') out.add('PJ');
  if (level === 'ENTRY' && /\b(estagio|estagiari[oa]|intern|internship)\b/.test(t)) out.add('INTERNSHIP');
  if (et === 'intern' || et === 'internship') out.add('INTERNSHIP');
  if (/\b(jovem aprendiz|aprendiz|apprentice)\b/.test(t)) out.add('APPRENTICE');
  if (/\b(temporari[oa]|fixed-term|temporary)\b/.test(t) || et === 'temporary' || et === 'fixedterm') out.add('TEMPORARY');
  if (/\b(freelance|freelancer)\b/.test(t)) out.add('FREELANCE');
  return out;
}

/** Salário mensal em BRL quando a vaga informa (estruturado ou "R$ 3.500" no texto). */
function monthlyBrl(job: JobForMatch, text: string): { min: number | null; max: number | null } | 'FOREIGN' | null {
  const s = job.salary;
  if (s && (s.min != null || s.max != null)) {
    if (s.currency && s.currency.toUpperCase() !== 'BRL') return 'FOREIGN';
    const div = s.period === 'YEAR' ? 12 : s.period === 'HOUR' ? 1 / 220 : 1;
    return { min: s.min != null ? Math.round(s.min / div) : null, max: s.max != null ? Math.round(s.max / div) : null };
  }
  const values = [...text.matchAll(/r\$ ?(\d{1,3}(?:\.\d{3})+|\d{3,6})(?:,\d{2})?/g)]
    .map((m) => Number(m[1].replace(/\./g, '')))
    .filter((v) => v >= 500 && v <= 100_000);
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

// ───────────── Cargo ─────────────

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'para', 'com', 'em', 'a', 'o', 'as', 'os', 'the', 'of', 'and', 'for', 'with', 'to', 'in',
  'i', 'ii', 'iii', 'iv', 'jr', 'sr', 'junior', 'senior', 'pleno', 'estagio', 'estagiario', 'estagiaria', 'intern', 'vaga', 'pcd',
]);
const SYNONYMS: Record<string, string> = {
  desenvolvedor: 'dev', desenvolvedora: 'dev', developer: 'dev', programador: 'dev', programadora: 'dev', engineer: 'eng',
  engenheiro: 'eng', engenheira: 'eng', software: 'software', suporte: 'suporte', support: 'suporte', helpdesk: 'suporte',
  analista: 'analista', analyst: 'analista', vendas: 'vendas', sales: 'vendas', vendedor: 'vendas', executivo: 'executivo',
  executive: 'executivo', atendimento: 'atendimento', customer: 'atendimento', dados: 'dados', data: 'dados',
  tecnico: 'tecnico', technical: 'tecnico', marketing: 'marketing', financeiro: 'financas', finance: 'financas',
  administrativo: 'administrativo', administrative: 'administrativo', assistente: 'assistente', assistant: 'assistente',
  designer: 'design', design: 'design', produto: 'produto', product: 'produto',
};
function tokens(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(/[^a-z0-9+#]+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t))
      .map((t) => SYNONYMS[t] ?? t),
  );
}

// ───────────── Motor ─────────────

/**
 * Compatibilidade determinística entre candidato e vaga. Regras:
 * - informação ausente na vaga nunca elimina (vira pergunta);
 * - só restrição ELIMINATORY com evidência no texto elimina;
 * - nenhum dado sensível do candidato é considerado.
 */
export function computeMatch(c: CandidateSnapshot, job: JobForMatch, weights: MatchWeights = DEFAULT_MATCH_WEIGHTS): MatchResult {
  const text = normalize(`${job.title}\n${job.department ?? ''}\n${job.description}`);
  const titleText = normalize(`${job.title} ${job.department ?? ''}`);
  const b: MatchBreakdown = {
    criteria: [],
    matchedSkills: [],
    missingSkills: [],
    met: [],
    unmet: [],
    eliminatedReasons: [],
    penalties: [],
    questions: [],
    limitations: [
      'Análise determinística por palavras-chave no texto publicado; sinônimos e contexto podem escapar.',
      'Competências reconhecidas pelo seu perfil e por um dicionário de termos comuns.',
    ],
  };
  if (job.description.length < 300) b.limitations.push('Descrição curta: avaliação limitada.');
  const scores = {} as Record<MatchCriterionKey, { score: number; detail: string }>;
  /** Teto da nota final por incompatibilidade estrutural (declarado em unmet). */
  let cap = 100;

  // Competências
  const candidateLabels = new Map<string, string>();
  for (const s of c.skills) {
    const dict = SKILL_DICTIONARY.find((d) => d.label.toLowerCase() === s.toLowerCase() || d.aliases.some((a) => normalize(a) === normalize(s)));
    candidateLabels.set(dict?.label ?? s, s);
  }
  const jobSkills = new Set<string>();
  for (const d of SKILL_DICTIONARY) if (d.aliases.some((a) => hasTerm(text, a))) jobSkills.add(d.label);
  for (const [label, raw] of candidateLabels) if (hasTerm(text, raw) || hasTerm(text, label)) jobSkills.add(label);
  b.matchedSkills = [...jobSkills].filter((s) => candidateLabels.has(s));
  b.missingSkills = [...jobSkills].filter((s) => !candidateLabels.has(s)).slice(0, 12);
  if (jobSkills.size === 0) {
    scores.skills = { score: 50, detail: 'A vaga não cita competências que eu consiga reconhecer.' };
  } else {
    scores.skills = {
      score: Math.round((100 * b.matchedSkills.length) / jobSkills.size),
      detail: `Você tem ${b.matchedSkills.length} de ${jobSkills.size} competências citadas.`,
    };
    if (b.matchedSkills.length) b.met.push(`Competências: ${b.matchedSkills.slice(0, 6).join(', ')}`);
    if (b.missingSkills.length) b.unmet.push(`Competências não declaradas no perfil: ${b.missingSkills.slice(0, 6).join(', ')}`);
  }

  // Experiência
  const level = jobLevel(job.title, job.employmentType);
  const reqYears = [
    ...text.matchAll(/(\d{1,2})\s*\+?\s*(?:anos?|years?)\s+(?:de\s+|of\s+)?(?:experiencia|experience)/g),
    ...text.matchAll(/(?:experiencia|experience)[^.\n]{0,40}?(\d{1,2})\s*\+?\s*(?:anos?|years?)/g),
  ]
    .map((m) => Number(m[1]))
    .filter((n) => n > 0 && n <= 20);
  const noExpJob = level === 'ENTRY' || /\b(sem experiencia|nao (e )?(necessaria|exigida) experiencia|no experience (required|needed)|primeiro emprego|entry[- ]level)\b/.test(text);
  const candYears = Math.round((c.experienceMonths / 12) * 10) / 10;
  if (reqYears.length) {
    const req = Math.min(...reqYears);
    const score = Math.min(100, Math.round((100 * c.experienceMonths) / (req * 12)));
    scores.experience = { score, detail: `Pede cerca de ${req} ano(s); você tem ${candYears}.` };
    (score >= 100 ? b.met : b.unmet).push(`Experiência: pede ${req} ano(s), você tem ${candYears}`);
  } else if (noExpJob) {
    scores.experience = { score: c.acceptsNoExperience || c.experienceMonths < 12 ? 100 : 80, detail: 'Vaga de entrada: não exige experiência.' };
    b.met.push('Não exige experiência prévia');
  } else if (level && TYPICAL_YEARS[level]) {
    const typical = TYPICAL_YEARS[level]!;
    const score = Math.min(100, Math.round((100 * c.experienceMonths) / (typical * 12)));
    scores.experience = {
      score,
      detail: `A vaga não informa anos; nível ${LEVEL_LABEL[level]} costuma pedir uns ${typical} (estimativa). Você tem ${candYears}.`,
    };
    if (score < 100) b.unmet.push(`Experiência estimada para nível ${LEVEL_LABEL[level]}: ~${typical} ano(s)`);
  } else {
    scores.experience = { score: 60, detail: 'A vaga não informa tempo de experiência.' };
  }

  // Senioridade
  if (!level) {
    scores.seniority = { score: 70, detail: 'O título não indica nível.' };
  } else {
    const diff = LEVELS.indexOf(level) - LEVELS.indexOf(candidateLevel(c.experienceMonths));
    const wantsEntry = c.contractTypes.includes('INTERNSHIP') || c.contractTypes.includes('APPRENTICE');
    let score = diff <= 0 && diff >= -1 ? 100 : diff === 1 ? 60 : diff >= 2 ? 15 : 50;
    if (level === 'ENTRY' && wantsEntry) score = 100;
    scores.seniority = { score, detail: `Vaga ${LEVEL_LABEL[level]}; seu histórico indica ${LEVEL_LABEL[candidateLevel(c.experienceMonths)]}.` };
    if (diff >= 2) {
      cap = SENIORITY_GAP_CAP;
      b.unmet.push(`Nível ${LEVEL_LABEL[level]} muito acima do seu histórico (nota limitada a ${SENIORITY_GAP_CAP})`);
    }
  }

  // Cargo
  if (c.targetRoles.length === 0) {
    scores.role = { score: 50, detail: 'Você ainda não definiu cargos pretendidos.' };
    b.questions.push('Defina cargos pretendidos no perfil para comparar com o título das vagas.');
  } else {
    const jobTokens = tokens(`${job.title} ${job.department ?? ''}`);
    let best = 0;
    let bestRole = c.targetRoles[0];
    for (const role of c.targetRoles) {
      const rt = tokens(role);
      if (rt.size === 0) continue;
      const overlap = [...rt].filter((t) => jobTokens.has(t)).length / rt.size;
      if (overlap > best) {
        best = overlap;
        bestRole = role;
      }
    }
    scores.role = { score: Math.round(best * 100), detail: best > 0 ? `Título próximo de "${bestRole}".` : 'Título diferente dos cargos pretendidos.' };
    if (best >= 0.5) b.met.push(`Cargo alinhado a "${bestRole}"`);
  }

  // Localização e modalidade
  const places = [c.city, c.state ? UF_NAMES[c.state] : null, ...c.regionsOfInterest].filter((p): p is string => !!p).map(normalize);
  const jobPlaces = job.locations.map(normalize);
  const placeMatch = places.length > 0 && jobPlaces.some((jp) => places.some((p) => jp.includes(p)));
  const modeLabel = { REMOTE: 'remota', HYBRID: 'híbrida', ONSITE: 'presencial', UNKNOWN: 'não informada' }[job.workplaceType];
  if (job.workplaceType === 'REMOTE') {
    const ok = c.workModes.length === 0 || c.workModes.includes('REMOTE');
    scores.location = { score: ok ? 100 : 40, detail: `Vaga remota${ok ? '' : ', fora das suas modalidades'}.` };
    (ok ? b.met : b.unmet).push('Modalidade remota');
  } else if (job.workplaceType === 'HYBRID' || job.workplaceType === 'ONSITE') {
    const modeOk = c.workModes.length === 0 || c.workModes.includes(job.workplaceType);
    if (!modeOk) {
      scores.location = { score: 20, detail: `Modalidade ${modeLabel}, fora das suas preferências.` };
      b.unmet.push(`Modalidade ${modeLabel}`);
    } else if (jobPlaces.length === 0) {
      scores.location = { score: 50, detail: `Modalidade ${modeLabel}, local não informado.` };
      b.questions.push('Onde fica o local de trabalho?');
    } else if (placeMatch) {
      scores.location = { score: 100, detail: `Modalidade ${modeLabel} em local compatível (${job.locations[0]}).` };
      b.met.push(`Local: ${job.locations[0]}`);
    } else {
      scores.location = { score: 25, detail: `Modalidade ${modeLabel} em ${job.locations.slice(0, 2).join(' / ')}.` };
      b.unmet.push(`Local: ${job.locations.slice(0, 2).join(' / ')}`);
    }
  } else if (placeMatch) {
    scores.location = { score: 70, detail: `Local compatível (${job.locations[0]}); modalidade não informada.` };
    b.met.push(`Local: ${job.locations[0]}`);
    b.questions.push('A vaga é presencial, híbrida ou remota?');
  } else {
    scores.location = { score: jobPlaces.length ? 35 : 50, detail: jobPlaces.length ? `Local: ${job.locations.slice(0, 2).join(' / ')}; modalidade não informada.` : 'Local e modalidade não informados.' };
    b.questions.push('A vaga é presencial, híbrida ou remota?');
  }

  // Formação
  const requiresDegree = /\b(ensino superior completo|superior completo|graduacao completa|formacao superior completa|bacharel|bachelor'?s degree|degree in)\b/.test(text);
  const acceptsStudent = /\b(cursando|estudante|em andamento|currently enrolled|pursuing)\b/.test(text);
  const higher = c.education.filter((e) => !/\b(ensino medio|medio|high school|tecnico)\b/.test(normalize(e.degree)));
  if (c.education.length === 0) {
    scores.education = { score: 50, detail: 'Sua formação ainda não está no perfil.' };
    if (requiresDegree || acceptsStudent) b.questions.push('Cadastre sua formação: a vaga cita requisitos acadêmicos.');
  } else if (acceptsStudent && higher.some((e) => e.status === 'IN_PROGRESS')) {
    scores.education = { score: 100, detail: 'Aceita estudantes; sua graduação está em andamento.' };
    b.met.push('Formação em andamento aceita');
  } else if (requiresDegree) {
    if (higher.some((e) => e.status === 'COMPLETED')) {
      scores.education = { score: 100, detail: 'Pede superior completo; você tem.' };
      b.met.push('Superior completo');
    } else if (higher.some((e) => e.status === 'IN_PROGRESS')) {
      scores.education = { score: 40, detail: 'Pede superior completo; o seu está em andamento.' };
      b.unmet.push('Superior completo (o seu está em andamento)');
    } else {
      scores.education = { score: 10, detail: 'Pede superior completo.' };
      b.unmet.push('Superior completo');
    }
  } else {
    scores.education = { score: 70, detail: 'A vaga não detalha formação exigida.' };
  }

  // Remuneração e contrato
  const contracts = jobContracts(text, job.employmentType, level);
  let contractPts: number;
  if (c.contractTypes.length === 0) contractPts = 25;
  else if (contracts.size === 0) {
    contractPts = 25;
    b.questions.push('Qual o tipo de contratação (CLT, PJ, estágio)?');
  } else if ([...contracts].some((k) => c.contractTypes.includes(k))) {
    contractPts = 50;
    b.met.push(`Contrato: ${[...contracts].join(', ')}`);
  } else {
    contractPts = 0;
    b.unmet.push(`Contrato ${[...contracts].join(', ')} fora das suas preferências`);
  }
  const salary = monthlyBrl(job, text);
  let salaryPts: number;
  let salaryDetail: string;
  if (salary === 'FOREIGN') {
    salaryPts = 25;
    salaryDetail = 'salário em moeda estrangeira, não comparado';
    b.limitations.push(`Salário publicado em ${job.salary?.currency}; não comparo com a pretensão em reais.`);
  } else if (!salary) {
    salaryPts = 25;
    salaryDetail = 'salário não informado';
    if (c.salaryExpectation) b.questions.push('Qual a faixa salarial?');
  } else {
    const top = salary.max ?? salary.min ?? 0;
    salaryDetail = `cerca de R$ ${top.toLocaleString('pt-BR')}/mês`;
    if (!c.salaryExpectation) salaryPts = 25;
    else if (top >= c.salaryExpectation) {
      salaryPts = 50;
      b.met.push(`Salário (${salaryDetail}) atende sua pretensão`);
    } else {
      salaryPts = Math.round((50 * top) / c.salaryExpectation);
      b.unmet.push(`Salário (${salaryDetail}) abaixo da pretensão de R$ ${c.salaryExpectation.toLocaleString('pt-BR')}`);
    }
  }
  const partTime = /\b(meio periodo|part[- ]?time)\b/.test(text) || normalize(job.employmentType ?? '').replace(/[^a-z]/g, '') === 'parttime';
  if (partTime && c.schedules.length > 0 && !c.schedules.includes('PART_TIME')) b.unmet.push('Meio período, fora das suas preferências');
  scores.compensation = {
    score: contractPts + salaryPts,
    detail: `${contracts.size ? `Contrato ${[...contracts].join('/')}` : 'Contrato não informado'}; ${salaryDetail}.`,
  };

  // Restrições do candidato
  for (const k of c.constraints) {
    const violation = evaluateConstraint(k, job, text, titleText, salary, b);
    if (!violation) continue;
    if (k.strength === 'ELIMINATORY') b.eliminatedReasons.push(violation);
    else b.penalties.push({ reason: violation, points: k.strength === 'IMPORTANT' ? 15 : 5 });
  }

  b.criteria = MATCH_CRITERIA.map(
    (m): MatchCriterionResult => ({ key: m.key, label: m.label, weight: weights[m.key], score: scores[m.key].score, detail: scores[m.key].detail }),
  );
  const weighted = b.criteria.reduce((acc, x) => acc + x.score * x.weight, 0) / 100;
  const penalty = b.penalties.reduce((acc, p) => acc + p.points, 0);
  const score = Math.max(0, Math.min(cap, Math.round(weighted - penalty)));
  return { score, eliminated: b.eliminatedReasons.length > 0, breakdown: b };
}

/** Devolve a descrição da violação, ou null. Sem evidência no texto, registra pergunta e não viola. */
function evaluateConstraint(
  k: Constraint,
  job: JobForMatch,
  text: string,
  titleText: string,
  salary: ReturnType<typeof monthlyBrl>,
  b: MatchBreakdown,
): string | null {
  switch (k.kind) {
    case 'NO_WEEKENDS': {
      const free = /\b(sem trabalho|folgas?|livres?|nao trabalha)\b.{0,25}\b(fins? de semana|finais de semana)\b/.test(text);
      const weekdays = /\b(segunda a sexta|monday (to|through) friday)\b/.test(text);
      const weekend = /\b(fins? de semana|finais de semana|sabados?|domingos?|escala 6x1|escala 12x36|12x36|6x1|weekends?)\b/.test(text);
      if (weekend && !weekdays && !free) return 'Menciona trabalho em fim de semana ou escala (6x1/12x36)';
      if (!weekend && !weekdays) b.questions.push('A jornada inclui fins de semana?');
      return null;
    }
    case 'NO_NIGHT_SHIFT':
      if (/\b(turno noturno|periodo noturno|horario noturno|turno da noite|night shift|overnight|madrugada)\b/.test(text)) return 'Menciona turno noturno';
      return null;
    case 'NO_ONSITE':
      if (job.workplaceType === 'ONSITE') return 'Vaga presencial';
      if (job.workplaceType === 'HYBRID') return 'Vaga híbrida (tem dias presenciais)';
      if (job.workplaceType === 'UNKNOWN') b.questions.push('A vaga tem dias presenciais?');
      return null;
    case 'MIN_SALARY':
      if (salary && salary !== 'FOREIGN') {
        const top = salary.max ?? salary.min;
        if (top != null && top < k.value) return `Salário (até R$ ${top.toLocaleString('pt-BR')}) abaixo do mínimo de R$ ${k.value.toLocaleString('pt-BR')}`;
      } else if (!salary && !b.questions.includes('Qual a faixa salarial?')) {
        b.questions.push('Qual a faixa salarial?');
      }
      return null;
    case 'ONLY_REGIONS': {
      if (job.workplaceType === 'REMOTE') return null;
      if (job.locations.length === 0) {
        b.questions.push('Onde fica o local de trabalho?');
        return null;
      }
      const regions = k.regions.map(normalize);
      const ok = job.locations.map(normalize).some((l) => regions.some((r) => l.includes(r)));
      return ok ? null : `Local fora das regiões escolhidas (${job.locations.slice(0, 2).join(' / ')})`;
    }
    case 'EXCLUDED_AREA':
      return hasTerm(titleText, k.area) ? `Área excluída por você: ${k.area}` : null;
  }
}
