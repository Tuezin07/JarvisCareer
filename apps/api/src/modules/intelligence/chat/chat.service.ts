import Anthropic from '@anthropic-ai/sdk';
import { ConflictException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ChatMessageDto, ChatStreamEvent } from '@jarvis/shared';
import { PrismaService } from '../../../common/prisma.service.js';
import { RedisService } from '../../../common/redis.service.js';
import { ENV, type Env } from '../../../config/env.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { ActivityService } from '../../activity/activity.service.js';
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm-provider.js';
import { UsageService } from '../llm/usage.service.js';
import { ActionRouter } from '../tools/action-router.js';
import { ConversationsService, DEFAULT_TITLE } from './conversations.service.js';
import { JARVIS_SYSTEM_PROMPT, turnContext } from './system-prompt.js';

/** Teto de voltas modelo→ferramentas por mensagem. Nunca há loop sem fim. */
export const MAX_ITERATIONS = 8;
const MAX_TOKENS = 16_000;
const LOCK_TTL_MS = 5 * 60_000;
const MAX_JSON_RETRIES = 2;

const SYSTEM: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: JARVIS_SYSTEM_PROMPT }];

type Emit = (event: ChatStreamEvent) => void;

const textOf = (content: Anthropic.Beta.BetaContentBlock[]) =>
  content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly conversations: ConversationsService,
    private readonly router: ActionRouter,
    private readonly activity: ActivityService,
    private readonly usage: UsageService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Verificações que precisam falhar com status HTTP, antes de abrir o streaming. */
  async prepare(userId: string, conversationId: string): Promise<void> {
    if (!this.llm.configured) {
      throw new ServiceUnavailableException('A conversa com IA não está configurada neste ambiente (falta ANTHROPIC_API_KEY).');
    }
    await this.conversations.findOwned(userId, conversationId);
    await this.usage.assertWithinBudget(userId);
  }

  async send(userId: string, conversationId: string, text: string, emit: Emit, signal: AbortSignal): Promise<void> {
    const lockKey = `jarvis:chat-lock:${conversationId}`;
    const locked = await this.redis.client.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX');
    if (!locked) throw new ConflictException('Já existe uma resposta em andamento nesta conversa.');

    try {
      await this.run(userId, conversationId, text, emit, signal);
    } catch (err) {
      await this.activity.setState(userId, 'error', 'A conversa encontrou um erro');
      throw err;
    } finally {
      await this.redis.client.del(lockKey);
    }
  }

  private async run(userId: string, conversationId: string, text: string, emit: Emit, signal: AbortSignal) {
    const profile = await this.prisma.candidateProfile.findUnique({ where: { userId }, select: { fullName: true } });
    const conversation = await this.conversations.findOwned(userId, conversationId);

    const userContent: Anthropic.Beta.BetaContentBlockParam[] = [
      { type: 'text', text: turnContext(profile?.fullName ?? 'candidato') },
      { type: 'text', text },
    ];
    const userMessage = await this.append(conversationId, userId, {
      role: 'user',
      kind: 'USER_TEXT',
      content: userContent,
      displayText: text,
    });
    if (conversation.title === DEFAULT_TITLE) {
      await this.prisma.conversation.update({ where: { id: conversationId }, data: { title: text.slice(0, 60) } });
    } else {
      await this.prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    }
    const userDto: ChatMessageDto = {
      id: userMessage.id,
      role: 'user',
      text,
      tools: [],
      createdAt: userMessage.createdAt.toISOString(),
    };
    emit({ type: 'user_message', message: userDto });

    const history = await this.history(conversationId);
    const tools = this.router.definitions();
    let lastAssistantId: string | null = null;
    let stopReason: string | null = null;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      if (signal.aborted) return;
      if (iteration > 0) await this.usage.assertWithinBudget(userId);
      await this.activity.setState(userId, 'thinking', 'Raciocinando sobre sua mensagem');

      const message = await this.callModel(history, tools, emit, signal);
      await this.usage.record(userId, 'chat', message, conversationId);
      stopReason = message.stop_reason;

      if (message.stop_reason === 'refusal') {
        // Recusa no meio do streaming: o parcial é descartado e não entra no histórico.
        emit({ type: 'text', delta: '\n\nNão posso ajudar com essa solicitação. Posso ajudar com outra coisa da sua busca de emprego?' });
        break;
      }
      if (message.stop_reason === 'pause_turn') {
        lastAssistantId = (await this.appendAssistant(conversationId, userId, message)).id;
        history.push({ role: 'assistant', content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
        continue;
      }

      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (toolUses.length > 0 && message.stop_reason === 'max_tokens') {
        throw new Error('A resposta foi cortada antes de terminar uma chamada de ferramenta.');
      }
      if (toolUses.length === 0 || message.stop_reason !== 'tool_use') {
        lastAssistantId = (await this.appendAssistant(conversationId, userId, message)).id;
        break;
      }

      await this.activity.setState(userId, 'executing', this.router.labelFor(toolUses[0].name));
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        emit({ type: 'tool', activity: { toolUseId: use.id, name: use.name, label: this.router.labelFor(use.name), status: 'running', summary: null } });
        const routed = await this.router.execute({ userId, conversationId }, { id: use.id, name: use.name, input: use.input });
        results.push(routed.result);
        emit({ type: 'tool', activity: routed.activity });
      }

      // Pedido de ferramenta e resultados entram juntos: o histórico nunca fica com tool_use sem resposta.
      const assistant = await this.prisma.$transaction(async (tx) => {
        const a = await this.append(conversationId, userId, this.assistantRow(message), tx);
        await this.append(conversationId, userId, { role: 'user', kind: 'TOOL_RESULTS', content: results, displayText: null }, tx);
        return a;
      });
      lastAssistantId = assistant.id;
      history.push({ role: 'assistant', content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
      history.push({ role: 'user', content: results });

      if (iteration === MAX_ITERATIONS - 1) {
        emit({ type: 'text', delta: '\n\n(Parei aqui: atingi o limite de etapas para uma única mensagem. Peça para eu continuar se precisar.)' });
      }
    }

    await this.activity.setState(userId, 'completed', 'Resposta concluída');
    emit({ type: 'done', messageId: lastAssistantId, stopReason });
  }

  /** Chama o modelo em streaming; JSON de ferramenta ilegível é refeito (até 2 vezes), erros da API sobem. */
  private async callModel(
    history: Anthropic.Beta.BetaMessageParam[],
    tools: Anthropic.Beta.BetaTool[],
    emit: Emit,
    signal: AbortSignal,
  ): Promise<Anthropic.Beta.BetaMessage> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.llm.streamTurn(
          { model: this.env.LLM_MODEL_PRIMARY, system: SYSTEM, messages: history, tools, maxTokens: MAX_TOKENS, effort: 'medium', signal },
          (delta) => emit({ type: 'text', delta }),
        );
      } catch (err) {
        if (err instanceof Anthropic.APIError || signal.aborted || attempt >= MAX_JSON_RETRIES) throw err;
        this.logger.warn(`Entrada de ferramenta ilegível; refazendo a volta (${attempt + 1}/${MAX_JSON_RETRIES})`);
      }
    }
  }

  private async history(conversationId: string): Promise<Anthropic.Beta.BetaMessageParam[]> {
    const rows = await this.prisma.message.findMany({ where: { conversationId }, orderBy: { seq: 'asc' } });
    return rows.map((r) => ({ role: r.role, content: r.content as unknown as Anthropic.Beta.BetaContentBlockParam[] }));
  }

  private assistantRow(message: Anthropic.Beta.BetaMessage) {
    return {
      role: 'assistant' as const,
      kind: 'ASSISTANT' as const,
      content: message.content,
      displayText: textOf(message.content) || null,
      model: message.model,
      stopReason: message.stop_reason,
    };
  }

  private appendAssistant(conversationId: string, userId: string, message: Anthropic.Beta.BetaMessage) {
    return this.append(conversationId, userId, this.assistantRow(message));
  }

  private async append(
    conversationId: string,
    userId: string,
    row: {
      role: 'user' | 'assistant';
      kind: 'USER_TEXT' | 'ASSISTANT' | 'TOOL_RESULTS';
      content: unknown;
      displayText: string | null;
      model?: string;
      stopReason?: string | null;
    },
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const last = await tx.message.findFirst({ where: { conversationId }, orderBy: { seq: 'desc' }, select: { seq: true } });
    return tx.message.create({
      data: {
        conversationId,
        userId,
        seq: (last?.seq ?? 0) + 1,
        role: row.role,
        kind: row.kind,
        content: row.content as Prisma.InputJsonValue,
        displayText: row.displayText,
        model: row.model ?? null,
        stopReason: row.stopReason ?? null,
      },
    });
  }
}
