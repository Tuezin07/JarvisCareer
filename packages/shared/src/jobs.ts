import { z } from 'zod';

// ───────────────────────────── Compatibilidade ─────────────────────────────

/** Critérios do motor de compatibilidade e pesos padrão (somam 100). Configuráveis por candidato. */
export const MATCH_CRITERIA = [
  { key: 'skills', label: 'Competências técnicas', defaultWeight: 30 },
  { key: 'experience', label: 'Experiência', defaultWeight: 20 },
  { key: 'role', label: 'Cargo e responsabilidades', defaultWeight: 15 },
  { key: 'seniority', label: 'Senioridade', defaultWeight: 10 },
  { key: 'location', label: 'Localização e modalidade', defaultWeight: 10 },
  { key: 'education', label: 'Formação', defaultWeight: 5 },
  { key: 'compensation', label: 'Remuneração e contrato', defaultWeight: 10 },
] as const;

export type MatchCriterionKey = (typeof MATCH_CRITERIA)[number]['key'];
export type MatchWeights = Record<MatchCriterionKey, number>;

export const DEFAULT_MATCH_WEIGHTS = Object.fromEntries(MATCH_CRITERIA.map((c) => [c.key, c.defaultWeight])) as MatchWeights;

export const matchWeightsSchema = z
  .object(Object.fromEntries(MATCH_CRITERIA.map((c) => [c.key, z.number().int().min(0).max(100)])) as Record<MatchCriterionKey, z.ZodNumber>)
  .refine((w) => Object.values(w).reduce((a, b) => a + b, 0) === 100, 'Os pesos precisam somar 100');

export interface MatchCriterionResult {
  key: MatchCriterionKey;
  label: string;
  weight: number;
  /** 0–100 */
  score: number;
  detail: string;
}

export interface MatchBreakdown {
  criteria: MatchCriterionResult[];
  matchedSkills: string[];
  missingSkills: string[];
  /** Requisitos da vaga que o perfil atende. */
  met: string[];
  /** Requisitos da vaga que o perfil não atende. */
  unmet: string[];
  /** Restrições eliminatórias violadas. */
  eliminatedReasons: string[];
  /** Penalidades aplicadas por restrições importantes/flexíveis. */
  penalties: Array<{ reason: string; points: number }>;
  /** Informação ausente na vaga que o candidato pode esclarecer. Nunca elimina. */
  questions: string[];
  limitations: string[];
}

// ───────────────────────────── Fontes e vagas ─────────────────────────────

export const jobProviderSchema = z.enum(['GREENHOUSE', 'LEVER', 'ASHBY']);
export type JobProvider = z.infer<typeof jobProviderSchema>;

export const JOB_PROVIDER_LABEL: Record<JobProvider, string> = {
  GREENHOUSE: 'Greenhouse',
  LEVER: 'Lever',
  ASHBY: 'Ashby',
};

export const followSourceSchema = z.object({
  url: z.string().trim().min(3).max(500).describe('Link da página de vagas da empresa (Greenhouse, Lever ou Ashby).'),
});

export const importJobSchema = z.object({
  url: z.string().trim().min(10).max(500).describe('Link de uma vaga específica num ATS suportado.'),
});

export const jobMatchStatusSchema = z.enum(['NEW', 'SAVED', 'DISMISSED']);
export type JobMatchStatus = z.infer<typeof jobMatchStatusSchema>;

export const jobsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  minScore: z.coerce.number().int().min(0).max(100).default(0),
  includeEliminated: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  status: jobMatchStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});
export type JobsQuery = z.infer<typeof jobsQuerySchema>;

export type FraudRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type WorkplaceType = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNKNOWN';

export interface FraudSignal {
  code: string;
  level: FraudRiskLevel;
  evidence: string;
}

export interface JobSourceDto {
  id: string;
  provider: JobProvider;
  boardToken: string;
  companyName: string;
  careersUrl: string;
  status: 'ACTIVE' | 'FAILING' | 'DISABLED';
  openJobCount: number | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface JobListItemDto {
  id: string;
  title: string;
  companyName: string;
  provider: JobProvider;
  locations: string[];
  workplaceType: WorkplaceType;
  employmentType: string | null;
  url: string;
  publishedAt: string | null;
  closed: boolean;
  fraudRisk: FraudRiskLevel;
  score: number;
  eliminated: boolean;
  status: JobMatchStatus;
  topReasons: string[];
}

export interface JobDetailDto extends JobListItemDto {
  department: string | null;
  description: string;
  applyUrl: string | null;
  salary: { min: number | null; max: number | null; currency: string | null; period: string | null } | null;
  fraudSignals: FraudSignal[];
  breakdown: MatchBreakdown;
}

export interface JobsListResponse {
  total: number;
  items: JobListItemDto[];
}
