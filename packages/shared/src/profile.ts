import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

const isoMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use o formato AAAA-MM');

export const BRAZIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: optionalText(30),
  city: optionalText(80),
  state: z.enum(BRAZIL_UFS).nullable().optional(),
  headline: optionalText(160),
  summary: optionalText(4000),
  targetRoles: z.array(z.string().trim().min(2).max(80)).max(15).default([]),
  regionsOfInterest: z.array(z.string().trim().min(2).max(80)).max(20).default([]),
  availability: optionalText(200),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const workModeSchema = z.enum(['REMOTE', 'HYBRID', 'ONSITE']);
export const contractTypeSchema = z.enum([
  'CLT',
  'PJ',
  'INTERNSHIP',
  'APPRENTICE',
  'FREELANCE',
  'TEMPORARY',
]);
export const scheduleSchema = z.enum(['FULL_TIME', 'PART_TIME']);

/**
 * Como cada restrição pesa na compatibilidade:
 * ELIMINATORY descarta a vaga; IMPORTANT reduz muito a nota; FLEXIBLE reduz pouco.
 * Informação ausente na vaga nunca elimina — vira pergunta a esclarecer.
 */
export const constraintStrengthSchema = z.enum(['ELIMINATORY', 'IMPORTANT', 'FLEXIBLE']);

export const constraintSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('NO_WEEKENDS'), strength: constraintStrengthSchema }),
  z.object({ kind: z.literal('NO_NIGHT_SHIFT'), strength: constraintStrengthSchema }),
  z.object({ kind: z.literal('NO_ONSITE'), strength: constraintStrengthSchema }),
  z.object({
    kind: z.literal('MIN_SALARY'),
    strength: constraintStrengthSchema,
    value: z.number().int().positive().max(1_000_000),
  }),
  z.object({
    kind: z.literal('ONLY_REGIONS'),
    strength: constraintStrengthSchema,
    regions: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
  }),
  z.object({
    kind: z.literal('EXCLUDED_AREA'),
    strength: constraintStrengthSchema,
    area: z.string().trim().min(2).max(80),
  }),
]);
export type Constraint = z.infer<typeof constraintSchema>;

export const preferencesSchema = z.object({
  workModes: z.array(workModeSchema).max(3).default([]),
  contractTypes: z.array(contractTypeSchema).max(6).default([]),
  schedules: z.array(scheduleSchema).max(2).default([]),
  salaryExpectation: z.number().int().positive().max(1_000_000).nullable().optional(),
  firstJob: z.boolean().default(false),
  acceptsNoExperience: z.boolean().default(true),
  constraints: z.array(constraintSchema).max(30).default([]),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;

export const experienceSchema = z.object({
  company: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  kind: z.enum(['JOB', 'INTERNSHIP', 'VOLUNTEER', 'PROJECT']).default('JOB'),
  location: optionalText(120),
  startMonth: isoMonth,
  endMonth: isoMonth.nullable().optional(),
  description: optionalText(4000),
});
export const experiencesSchema = z.object({ items: z.array(experienceSchema).max(50) });
export type ExperienceInput = z.infer<typeof experienceSchema>;

export const educationSchema = z.object({
  institution: z.string().trim().min(1).max(160),
  degree: z.string().trim().min(1).max(160),
  field: optionalText(160),
  status: z.enum(['COMPLETED', 'IN_PROGRESS', 'INCOMPLETE']).default('COMPLETED'),
  startMonth: isoMonth.nullable().optional(),
  endMonth: isoMonth.nullable().optional(),
});
export const educationListSchema = z.object({ items: z.array(educationSchema).max(30) });
export type EducationInput = z.infer<typeof educationSchema>;

export const skillSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['TECHNICAL', 'BEHAVIORAL', 'TOOL']).default('TECHNICAL'),
  level: z.enum(['BASIC', 'INTERMEDIATE', 'ADVANCED']).nullable().optional(),
});
export const skillsSchema = z.object({ items: z.array(skillSchema).max(100) });
export type SkillInput = z.infer<typeof skillSchema>;

/**
 * Completude do perfil, calculada de forma determinística.
 * Cada item vale o mesmo; o que falta é devolvido para orientar o candidato.
 */
export interface CompletenessInput {
  fullName?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  headline?: string | null;
  targetRoles?: string[];
  hasPreferences: boolean;
  experienceCount: number;
  educationCount: number;
  skillCount: number;
  resumeCount: number;
}

export interface Completeness {
  percent: number;
  missing: string[];
}

export function computeProfileCompleteness(p: CompletenessInput): Completeness {
  const checks: Array<[boolean, string]> = [
    [!!p.fullName, 'Nome completo'],
    [!!p.phone, 'Telefone'],
    [!!p.city && !!p.state, 'Cidade e estado'],
    [!!p.headline, 'Título profissional'],
    [(p.targetRoles?.length ?? 0) > 0, 'Cargos pretendidos'],
    [p.hasPreferences, 'Preferências de trabalho'],
    [p.experienceCount > 0, 'Experiências ou projetos'],
    [p.educationCount > 0, 'Formação'],
    [p.skillCount >= 3, 'Pelo menos 3 competências'],
    [p.resumeCount > 0, 'Currículo enviado'],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter(([ok]) => !ok).map(([, label]) => label),
  };
}
