import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa de pelo menos 32 caracteres'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_LOCAL_DIR: z.string().min(1).default('./storage'),
  // Fase 2 — sem chave, as rotas de IA respondem 503 com mensagem clara.
  ANTHROPIC_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  LLM_MODEL_PRIMARY: z.string().min(1).default('claude-opus-5-5'),
  LLM_MODEL_BULK: z.string().min(1).default('claude-opus-5-5'),
  /** Teto de gasto com LLM por candidato numa janela móvel de 24 h. */
  LLM_DAILY_BUDGET_USD: z.coerce.number().positive().default(2),
  // Fase 4 — site de testes controlado (habilita o preenchimento de teste). Vazio em produção.
  AUTOMATION_TEST_SITE_URL: z.string().optional().transform((v) => (v ? v.replace(/\/$/, '') : undefined)),
  /** Dias de retenção das capturas de tela de evidência. */
  EVIDENCE_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

/**
 * Carrega `.env` (ou `.env.test` com NODE_ENV=test) sem sobrescrever variáveis já
 * definidas no ambiente, valida e falha cedo com mensagem legível.
 */
export function loadEnv(): Env {
  const file = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
  try {
    process.loadEnvFile(file);
  } catch {
    // Sem arquivo: produção/CI fornecem as variáveis diretamente.
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuração inválida:\n  ${issues.join('\n  ')}`);
  }
  return parsed.data;
}
