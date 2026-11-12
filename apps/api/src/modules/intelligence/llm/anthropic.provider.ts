import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../../config/env.js';
import {
  type LlmProvider,
  LlmNotConfiguredError,
  LlmRefusalError,
  type LlmStructuredRequest,
  type LlmTurnRequest,
} from './llm-provider.js';

/** Recusas são reprocessadas no servidor por outro modelo, roteado pela categoria. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

@Injectable()
export class AnthropicProvider implements LlmProvider {
  private readonly client: Anthropic | null;

  constructor(@Inject(ENV) env: Env) {
    this.client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 }) : null;
  }

  get configured(): boolean {
    return this.client !== null;
  }

  async streamTurn(req: LlmTurnRequest, onText: (delta: string) => void): Promise<Anthropic.Beta.BetaMessage> {
    const client = this.require();
    const stream = client.beta.messages.stream(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        system: req.system,
        messages: req.messages,
        // Entradas das ferramentas chegam sem buffer; o Action Router valida cada uma.
        tools: req.tools.map((t) => ({ ...t, eager_input_streaming: true })),
        thinking: { type: 'adaptive' },
        output_config: { effort: req.effort },
        // Cache automático do último bloco: o histórico estável não é recobrado a cada volta.
        cache_control: { type: 'ephemeral' },
      },
      { signal: req.signal },
    );
    stream.on('text', onText);
    return stream.finalMessage();
  }

  async structured<T>(req: LlmStructuredRequest<T>): Promise<{ data: T; message: Anthropic.Beta.BetaMessage }> {
    const client = this.require();
    const message = await client.beta.messages.parse({
      model: req.model,
      max_tokens: req.maxTokens,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      system: req.system,
      messages: [{ role: 'user', content: req.userContent }],
      thinking: { type: 'adaptive' },
      output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) },
    });
    if (message.stop_reason === 'refusal') {
      throw new LlmRefusalError(message.stop_details?.category ?? null);
    }
    if (message.stop_reason === 'max_tokens' || message.parsed_output == null) {
      throw new Error(`Saída estruturada incompleta (stop_reason=${message.stop_reason})`);
    }
    return { data: message.parsed_output as T, message };
  }

  private require(): Anthropic {
    if (!this.client) throw new LlmNotConfiguredError();
    return this.client;
  }
}
