import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export type Effort = 'low' | 'medium' | 'high';

export interface LlmTurnRequest {
  model: string;
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: Anthropic.Beta.BetaTool[];
  maxTokens: number;
  effort: Effort;
  signal?: AbortSignal;
}

export interface LlmStructuredRequest<T> {
  model: string;
  system: string;
  userContent: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  effort: Effort;
}

/**
 * Fronteira com o provedor de modelo. O formato canônico de mensagens é o da
 * Messages API da Anthropic (ADR-0008); outro provedor entra como adaptador.
 */
export interface LlmProvider {
  readonly configured: boolean;
  /** Uma volta do modelo em streaming; `onText` recebe os trechos de texto visível. */
  streamTurn(req: LlmTurnRequest, onText: (delta: string) => void): Promise<Anthropic.Beta.BetaMessage>;
  /** Saída estruturada validada pelo schema Zod. */
  structured<T>(req: LlmStructuredRequest<T>): Promise<{ data: T; message: Anthropic.Beta.BetaMessage }>;
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super('A inteligência artificial não está configurada (ANTHROPIC_API_KEY ausente).');
  }
}

export class LlmRefusalError extends Error {
  constructor(public readonly category: string | null) {
    super('O modelo recusou esta solicitação.');
  }
}
