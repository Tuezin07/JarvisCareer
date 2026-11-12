import { Body, Controller, Delete, Get, HttpCode, Logger, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { z } from 'zod';
import {
  createConversationSchema,
  sendMessageSchema,
  type ChatMessageDto,
  type ChatStreamEvent,
  type ConversationDto,
} from '@jarvis/shared';
import { type AuthUser, CurrentUser } from '../../../common/auth/auth.decorators.js';
import { publicLlmErrorMessage } from '../llm/llm-errors.js';
import { ChatService } from './chat.service.js';
import { ConversationsService } from './conversations.service.js';

@Controller('conversations')
export class ConversationsController {
  private readonly logger = new Logger(ConversationsController.name);

  constructor(
    private readonly conversations: ConversationsService,
    private readonly chat: ChatService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ConversationDto[]> {
    return this.conversations.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createConversationSchema }) body: z.infer<typeof createConversationSchema>,
  ): Promise<ConversationDto> {
    return this.conversations.create(user.id, body.title);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ChatMessageDto[]> {
    return this.conversations.messages(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.conversations.remove(user.id, id);
  }

  /**
   * Envia uma mensagem e devolve a resposta em streaming (text/event-stream).
   * Erros de pré-condição saem como HTTP normal; depois de aberto o stream, como evento `error`.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':id/messages')
  async send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: sendMessageSchema }) body: z.infer<typeof sendMessageSchema>,
    @Res() res: Response,
  ): Promise<void> {
    await this.chat.prepare(user.id, id);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    const emit = (event: ChatStreamEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await this.chat.send(user.id, id, body.text, emit, abort.signal);
    } catch (err) {
      this.logger.warn(`Conversa ${id} falhou: ${err instanceof Error ? err.message : String(err)}`);
      emit({ type: 'error', message: publicLlmErrorMessage(err) });
    } finally {
      res.end();
    }
  }
}
