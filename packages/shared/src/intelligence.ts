import { z } from 'zod';

// ───────────────────────────── Análise de currículo ─────────────────────────────

/**
 * Critérios da nota de qualidade documental. Os pesos são fixos e públicos; o modelo
 * avalia cada critério e o backend calcula a nota final (o modelo não dá a nota total).
 * A nota mede o documento, nunca a probabilidade de contratação.
 */
export const RESUME_CRITERIA = [
  { key: 'clarity', label: 'Clareza e organização', weight: 20, description: 'Estrutura, ordem das seções, objetividade e facilidade de leitura.' },
  { key: 'evidence', label: 'Conteúdo e evidências', weight: 25, description: 'Atividades descritas com resultados, contexto e ferramentas; competências comprovadas por experiências ou projetos.' },
  { key: 'relevance', label: 'Relevância para os cargos pretendidos', weight: 20, description: 'Alinhamento do conteúdo e das palavras-chave com os cargos que o candidato busca.' },
  { key: 'ats', label: 'Legibilidade por ATS', weight: 15, description: 'Texto selecionável, seções padrão, ausência de elementos que sistemas de triagem não leem.' },
  { key: 'language', label: 'Correção linguística', weight: 10, description: 'Ortografia, gramática e consistência de tempo verbal.' },
  { key: 'completeness', label: 'Completude', weight: 10, description: 'Contato, formação, experiências, competências e idiomas presentes.' },
] as const;

export type ResumeCriterionKey = (typeof RESUME_CRITERIA)[number]['key'];

const criterionKeys = RESUME_CRITERIA.map((c) => c.key) as [ResumeCriterionKey, ...ResumeCriterionKey[]];

export const ISSUE_TYPES = [
  'ORTOGRAFIA',
  'ORGANIZACAO',
  'REDUNDANCIA',
  'DESCRICAO_FRACA',
  'COMPETENCIA_SEM_EVIDENCIA',
  'PALAVRAS_CHAVE',
  'FORMATACAO',
  'ATS',
  'INCONSISTENCIA',
  'DESTAQUE',
] as const;

/**
 * O que o modelo devolve (saída estruturada). Sem restrições numéricas no schema:
 * o backend recorta os valores para 0–100.
 */
export const resumeAnalysisLlmSchema = z.object({
  summary: z.string().describe('Diagnóstico geral em 3 a 5 frases, em português do Brasil.'),
  criteria: z
    .array(
      z.object({
        key: z.enum(criterionKeys),
        score: z.number().int().describe('Nota de 0 a 100 para este critério.'),
        rationale: z.string().describe('Justificativa objetiva, citando trechos do currículo quando possível.'),
      }),
    )
    .describe('Uma entrada para cada um dos seis critérios.'),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  issues: z.array(
    z.object({
      type: z.enum(ISSUE_TYPES),
      severity: z.enum(['BAIXA', 'MEDIA', 'ALTA']),
      excerpt: z.string().nullable().describe('Trecho literal do currículo, ou null.'),
      explanation: z.string(),
      suggestion: z.string(),
    }),
  ),
  identified: z.object({
    technicalSkills: z.array(z.string()),
    behavioralSkills: z.array(z.string()),
    languages: z.array(z.object({ name: z.string(), level: z.string().nullable() })),
    certifications: z.array(z.string()),
    education: z.array(z.object({ institution: z.string(), degree: z.string(), status: z.string().nullable() })),
    experiences: z.array(z.object({ company: z.string(), title: z.string(), period: z.string().nullable() })),
  }),
  missingInformation: z.array(z.string()),
  compatibleRoles: z.array(z.object({ role: z.string(), reason: z.string() })),
  skillsToDevelop: z.array(z.object({ skill: z.string(), why: z.string() })),
  recommendations: z.array(z.string()).describe('Ações práticas, em ordem de impacto.'),
  limitations: z.array(z.string()).describe('O que não pôde ser avaliado e por quê.'),
});
export type ResumeAnalysisLlm = z.infer<typeof resumeAnalysisLlmSchema>;

export interface ScoredCriterion {
  key: ResumeCriterionKey;
  label: string;
  weight: number;
  score: number;
  rationale: string;
}

/** Nota final determinística: média ponderada dos critérios (0–100). */
export function scoreResumeCriteria(criteria: ResumeAnalysisLlm['criteria']): { total: number; criteria: ScoredCriterion[] } {
  const scored = RESUME_CRITERIA.map((c) => {
    const found = criteria.find((x) => x.key === c.key);
    const score = Math.max(0, Math.min(100, Math.round(found?.score ?? 0)));
    return { key: c.key, label: c.label, weight: c.weight, score, rationale: found?.rationale ?? 'Critério não avaliado.' };
  });
  const total = Math.round(scored.reduce((acc, c) => acc + c.score * c.weight, 0) / 100);
  return { total, criteria: scored };
}

export type AnalysisStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface ResumeAnalysisDto {
  id: string;
  resumeId: string;
  status: AnalysisStatus;
  model: string | null;
  score: number | null;
  criteria: ScoredCriterion[] | null;
  result: Omit<ResumeAnalysisLlm, 'criteria'> | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ───────────────────────────── Conversa ─────────────────────────────

export const sendMessageSchema = z.object({
  text: z.string().trim().min(1, 'Mensagem vazia').max(4000, 'Mensagem longa demais (máx. 4000 caracteres)'),
});

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export interface ConversationDto {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type ToolActivityStatus = 'running' | 'succeeded' | 'failed' | 'denied';

export interface ToolActivity {
  toolUseId: string;
  name: string;
  label: string;
  status: ToolActivityStatus;
  summary: string | null;
}

export interface ChatMessageDto {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools: ToolActivity[];
  createdAt: string;
}

/** Eventos enviados em streaming na resposta de POST /conversations/:id/messages. */
export type ChatStreamEvent =
  | { type: 'user_message'; message: ChatMessageDto }
  | { type: 'text'; delta: string }
  | { type: 'tool'; activity: ToolActivity }
  | { type: 'done'; messageId: string | null; stopReason: string | null }
  | { type: 'error'; message: string };

export interface UsageSummaryDto {
  todayUsd: number;
  dailyBudgetUsd: number;
  last30dUsd: number;
}
