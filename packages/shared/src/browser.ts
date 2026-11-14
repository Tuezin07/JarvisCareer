import { z } from 'zod';

/**
 * JARVIS WEB — contrato entre a API e o executor isolado (apps/automation).
 * O executor não acessa o banco: recebe tudo o que precisa na tarefa e devolve
 * resultado e evidências. Versionado para permitir evolução independente.
 */

export const browserTaskKindSchema = z.enum([
  /** Abre a página de candidatura e descreve o formulário. Só leitura. */
  'INSPECT_PAGE',
  /** Preenche o formulário do site de testes controlado, sem enviar. */
  'FILL_TEST_FORM',
]);
export type BrowserTaskKind = z.infer<typeof browserTaskKindSchema>;

export const browserSessionStatusSchema = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'WAITING_HUMAN', 'CANCELLED', 'BLOCKED']);
export type BrowserSessionStatus = z.infer<typeof browserSessionStatusSchema>;

export const automationProfileSchema = z.object({
  fullName: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
});
export type AutomationProfile = z.infer<typeof automationProfileSchema>;

export const automationTaskSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  kind: browserTaskKindSchema,
  targetUrl: z.string().url(),
  /** Hosts em que a página principal pode navegar (recursos de outros hosts públicos são permitidos). */
  navigationAllowlist: z.array(z.string().min(1)).min(1).max(20),
  captureScreenshots: z.boolean(),
  profile: automationProfileSchema.optional(),
  resume: z.object({ fileName: z.string(), mimeType: z.string(), base64: z.string() }).optional(),
  limits: z.object({ timeoutMs: z.number().int().min(5_000).max(300_000), maxSteps: z.number().int().min(1).max(50) }),
});
export type AutomationTask = z.infer<typeof automationTaskSchema>;

export const formFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  accept: z.string().nullable().optional(),
  /** Dica de preenchimento declarada pela página (atributo autocomplete, ex.: "given-name"). */
  autocomplete: z.string().nullable().optional(),
});
export type FormField = z.infer<typeof formFieldSchema>;

export const fieldMappingSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  required: z.boolean(),
  /** AUTO: dá para preencher com dados verificados do perfil; NEEDS_HUMAN: o candidato decide. */
  status: z.enum(['AUTO', 'NEEDS_HUMAN', 'SKIPPED']),
  /** De onde viria o valor (ex.: "perfil.email", "currículo principal"). Nunca o valor em si. */
  source: z.string().nullable(),
  reason: z.string(),
  /** Opções de perguntas de escolha (texto da página, não dado do candidato). */
  options: z.array(z.string()).max(30).optional(),
});
export type FieldMapping = z.infer<typeof fieldMappingSchema>;

export const blockerSchema = z.object({
  kind: z.enum(['CAPTCHA', 'LOGIN', 'MFA', 'NAVIGATION_BLOCKED']),
  detail: z.string(),
});
export type Blocker = z.infer<typeof blockerSchema>;

export const browserStepSchema = z.object({
  index: z.number().int(),
  action: z.string(),
  target: z.string().nullable(),
  status: z.enum(['OK', 'FAILED', 'SKIPPED', 'BLOCKED']),
  detail: z.string(),
  durationMs: z.number().int(),
});
export type BrowserStep = z.infer<typeof browserStepSchema>;

export const automationResultSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  status: browserSessionStatusSchema.exclude(['QUEUED', 'RUNNING']),
  executor: z.literal('playwright'),
  provider: z.enum(['local', 'browserbase']),
  startedAt: z.string(),
  finishedAt: z.string(),
  finalUrl: z.string().nullable(),
  title: z.string().nullable(),
  steps: z.array(browserStepSchema),
  fields: z.array(formFieldSchema),
  mapping: z.array(fieldMappingSchema),
  blockers: z.array(blockerSchema),
  /** Requisições que a política de rede barrou (amostra). */
  blockedRequests: z.array(z.string()).max(20),
  screenshots: z.array(z.object({ label: z.string(), mimeType: z.literal('image/jpeg'), base64: z.string() })).max(5),
  error: z.string().nullable(),
});
export type AutomationResult = z.infer<typeof automationResultSchema>;

// ───────────── DTOs para a interface ─────────────

export interface BrowserEvidenceDto {
  id: string;
  label: string;
  /** Caminho da API que serve a imagem (só para o dono). */
  url: string;
  createdAt: string;
  expiresAt: string;
}

export interface BrowserSessionDto {
  id: string;
  kind: BrowserTaskKind;
  status: BrowserSessionStatus;
  targetUrl: string;
  finalUrl: string | null;
  title: string | null;
  listingId: string | null;
  provider: string | null;
  steps: BrowserStep[];
  fields: FormField[];
  mapping: FieldMapping[];
  blockers: Blocker[];
  blockedRequests: string[];
  evidence: BrowserEvidenceDto[];
  screenshotsConsent: boolean;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface BrowserCapabilitiesDto {
  /** Formulário de testes controlado disponível neste ambiente. */
  testSiteUrl: string | null;
  screenshotsConsent: boolean;
  dailyLimit: number;
  usedToday: number;
}

export const BROWSER_STATUS_LABEL: Record<BrowserSessionStatus, string> = {
  QUEUED: 'Na fila',
  RUNNING: 'Executando',
  SUCCEEDED: 'Concluída',
  FAILED: 'Falhou',
  WAITING_HUMAN: 'Aguardando você',
  CANCELLED: 'Cancelada',
  BLOCKED: 'Bloqueada pela política',
};
