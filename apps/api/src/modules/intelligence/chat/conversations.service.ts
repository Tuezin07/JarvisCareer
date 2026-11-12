import { Injectable, NotFoundException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import type { ChatMessageDto, ConversationDto, ToolActivity } from '@jarvis/shared';
import { PrismaService } from '../../../common/prisma.service.js';
import type { Conversation } from '../../../generated/prisma/client.js';
import { ActionRouter } from '../tools/action-router.js';

export const DEFAULT_TITLE = 'Nova conversa';

export const toConversationDto = (c: Conversation): ConversationDto => ({
  id: c.id,
  title: c.title,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly router: ActionRouter,
  ) {}

  async list(userId: string): Promise<ConversationDto[]> {
    const rows = await this.prisma.conversation.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 100 });
    return rows.map(toConversationDto);
  }

  async create(userId: string, title?: string): Promise<ConversationDto> {
    return toConversationDto(await this.prisma.conversation.create({ data: { userId, title: title ?? DEFAULT_TITLE } }));
  }

  async findOwned(userId: string, id: string): Promise<Conversation> {
    const c = await this.prisma.conversation.findFirst({ where: { id, userId } });
    if (!c) throw new NotFoundException('Conversa não encontrada');
    return c;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.prisma.conversation.delete({ where: { id } });
  }

  /**
   * Visão da interface: cada mensagem do candidato seguida de uma resposta do JARVIS que
   * agrega o texto de todas as voltas do modelo e as ferramentas executadas no meio.
   */
  async messages(userId: string, id: string): Promise<ChatMessageDto[]> {
    await this.findOwned(userId, id);
    const [rows, actions] = await Promise.all([
      this.prisma.message.findMany({ where: { conversationId: id }, orderBy: { seq: 'asc' } }),
      this.prisma.actionExecution.findMany({ where: { conversationId: id, userId } }),
    ]);
    const byToolUse = new Map(actions.map((a) => [a.toolUseId, a]));
    const out: ChatMessageDto[] = [];
    let current: ChatMessageDto | null = null;

    for (const m of rows) {
      if (m.kind === 'USER_TEXT') {
        current = null;
        out.push({ id: m.id, role: 'user', text: m.displayText ?? '', tools: [], createdAt: m.createdAt.toISOString() });
        continue;
      }
      if (m.kind !== 'ASSISTANT') continue;
      if (!current) {
        current = { id: m.id, role: 'assistant', text: '', tools: [], createdAt: m.createdAt.toISOString() };
        out.push(current);
      }
      if (m.displayText) current.text += (current.text ? '\n\n' : '') + m.displayText;
      for (const block of m.content as unknown as Anthropic.Beta.BetaContentBlock[]) {
        if (block.type !== 'tool_use') continue;
        const exec = byToolUse.get(block.id);
        const activity: ToolActivity = {
          toolUseId: block.id,
          name: block.name,
          label: this.router.labelFor(block.name),
          status: !exec ? 'failed' : exec.status === 'SUCCEEDED' ? 'succeeded' : exec.status === 'DENIED' ? 'denied' : 'failed',
          summary: exec?.summary ?? null,
        };
        current.tools.push(activity);
      }
    }
    return out;
  }
}
