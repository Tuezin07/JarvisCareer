import type { z } from 'zod';
import type { ActionRisk } from '../../../generated/prisma/client.js';

export interface ToolContext {
  userId: string;
  conversationId: string | null;
}

export interface ToolOutcome {
  /** Devolvido ao modelo como JSON. */
  content: unknown;
  /** Uma linha legível para a interface e o histórico. */
  summary: string;
}

export interface ToolDefinition<I = any> {
  name: string;
  /** Rótulo curto exibido na interface enquanto a ferramenta roda. */
  label: string;
  description: string;
  risk: ActionRisk;
  input: z.ZodType<I>;
  /** Máximo de execuções bem-sucedidas por candidato em 24 h. */
  dailyLimit?: number;
  run(ctx: ToolContext, input: I): Promise<ToolOutcome>;
}

export const defineTool = <I>(t: ToolDefinition<I>): ToolDefinition<I> => t;

/**
 * Envolve conteúdo que não foi escrito pelo sistema (currículo, páginas, e-mails).
 * O prompt de sistema instrui o modelo a tratar esse bloco como dado, nunca como instrução.
 */
export function untrusted(source: string, text: string): string {
  const safe = text.replaceAll('</dados_externos>', '</dados_externos_>');
  return `<dados_externos origem="${source}">\n${safe}\n</dados_externos>`;
}
