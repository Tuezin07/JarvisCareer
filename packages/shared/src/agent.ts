import { z } from 'zod';

/**
 * Estados do núcleo. A interface só anima o que o backend publica:
 * nenhum estado é inventado no cliente.
 */
export const agentStateSchema = z.enum([
  'idle',
  'listening',
  'thinking',
  'researching',
  'analyzing',
  'executing',
  'waiting_approval',
  'error',
  'completed',
]);
export type AgentState = z.infer<typeof agentStateSchema>;

export const AGENT_STATE_LABEL: Record<AgentState, string> = {
  idle: 'Em espera',
  listening: 'Ouvindo',
  thinking: 'Raciocinando',
  researching: 'Pesquisando',
  analyzing: 'Analisando',
  executing: 'Executando',
  waiting_approval: 'Aguardando aprovação',
  error: 'Erro',
  completed: 'Concluído',
};

export const agentEventLevelSchema = z.enum(['info', 'success', 'warning', 'error']);
export type AgentEventLevel = z.infer<typeof agentEventLevelSchema>;

export interface AgentEventDto {
  id: string;
  type: string;
  level: AgentEventLevel;
  title: string;
  detail: string | null;
  createdAt: string;
}

export interface AgentStateSnapshot {
  state: AgentState;
  /** O que o agente está fazendo, em texto curto, para leitores de tela e para o HUD. */
  label: string | null;
  updatedAt: string;
}

/** Mensagens do canal SSE `/api/activity/stream`. */
export type StreamMessage =
  | { kind: 'state'; snapshot: AgentStateSnapshot }
  | { kind: 'event'; event: AgentEventDto }
  | { kind: 'ping'; at: string };
