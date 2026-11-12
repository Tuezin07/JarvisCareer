import type Anthropic from '@anthropic-ai/sdk';
import type { LlmProvider, LlmStructuredRequest, LlmTurnRequest } from '../src/modules/intelligence/llm/llm-provider.js';

type Block = Anthropic.Beta.BetaContentBlock;

let counter = 0;

/** Monta uma BetaMessage plausível para os testes (só os campos que o sistema lê). */
export function fakeMessage(content: Block[], stopReason: Anthropic.Beta.BetaStopReason): Anthropic.Beta.BetaMessage {
  return {
    id: `msg_fake_${++counter}`,
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Beta.BetaMessage;
}

export const text = (t: string): Block => ({ type: 'text', text: t, citations: null }) as Block;

export const toolUse = (name: string, input: unknown): Block =>
  ({ type: 'tool_use', id: `toolu_fake_${++counter}`, name, input }) as Block;

/**
 * Provedor roteirizado: cada chamada consome a próxima resposta da fila e guarda
 * a requisição recebida para inspeção.
 */
export class FakeLlmProvider implements LlmProvider {
  configured = true;
  readonly turnRequests: LlmTurnRequest[] = [];
  readonly structuredRequests: LlmStructuredRequest<unknown>[] = [];
  private turns: Anthropic.Beta.BetaMessage[] = [];
  structuredData: unknown = null;

  script(...turns: Anthropic.Beta.BetaMessage[]) {
    this.turns.push(...turns);
  }

  async streamTurn(req: LlmTurnRequest, onText: (delta: string) => void): Promise<Anthropic.Beta.BetaMessage> {
    this.turnRequests.push(structuredClone({ ...req, signal: undefined }));
    const next = this.turns.shift();
    if (!next) throw new Error('FakeLlmProvider: nenhuma resposta roteirizada');
    for (const b of next.content) if (b.type === 'text') onText(b.text);
    return next;
  }

  async structured<T>(req: LlmStructuredRequest<T>): Promise<{ data: T; message: Anthropic.Beta.BetaMessage }> {
    this.structuredRequests.push(req as LlmStructuredRequest<unknown>);
    return { data: req.schema.parse(this.structuredData), message: fakeMessage([], 'end_turn') };
  }
}
