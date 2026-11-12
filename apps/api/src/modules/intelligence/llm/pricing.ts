import type Anthropic from '@anthropic-ai/sdk';

/** US$ por milhão de tokens (tabela da Anthropic, 2026-10). Conferir antes de uso comercial. */
interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

const PRICES: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  // Modelo para onde o fallback do servidor pode rotear recusas da categoria cyber.
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
};

/** Escrita em cache (TTL de 5 min) custa 1,25× a entrada. */
const CACHE_WRITE_MULTIPLIER = 1.25;

export function priceFor(model: string): Price | null {
  return PRICES[model] ?? null;
}

export type UsageLike = Pick<
  Anthropic.Beta.BetaUsage,
  'input_tokens' | 'output_tokens' | 'cache_read_input_tokens' | 'cache_creation_input_tokens'
>;

/** Custo em micro-dólares (inteiro). Modelo desconhecido usa o preço do modelo de referência. */
export function costMicroUsd(model: string, usage: UsageLike, fallbackModel = 'claude-opus-5-5'): number {
  const p = priceFor(model) ?? priceFor(fallbackModel)!;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const usd =
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      cacheRead * p.cacheRead +
      cacheWrite * p.input * CACHE_WRITE_MULTIPLIER) /
    1_000_000;
  return Math.round(usd * 1_000_000);
}
