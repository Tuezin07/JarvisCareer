import { Injectable } from '@nestjs/common';
import {
  AGENT_STATE_LABEL,
  type AgentEventDto,
  type AgentEventLevel,
  type AgentState,
  type AgentStateSnapshot,
  type StreamMessage,
} from '@jarvis/shared';
import { PrismaService } from '../../common/prisma.service.js';
import { RedisService } from '../../common/redis.service.js';
import type { AgentEvent } from '../../generated/prisma/client.js';

export const userChannel = (userId: string) => `jarvis:user:${userId}`;
const stateKey = (userId: string) => `jarvis:state:${userId}`;
/** Estado sem atualização há mais tempo que isso volta a ser "idle" (processo pode ter morrido). */
const STATE_TTL_SECONDS = 600;

export interface RecordEventInput {
  type: string;
  title: string;
  level?: AgentEventLevel;
  detail?: string | null;
  subject?: string | null;
  taskId?: string | null;
}

export function toEventDto(e: AgentEvent): AgentEventDto {
  return {
    id: e.id,
    type: e.type,
    level: e.level,
    title: e.title,
    detail: e.detail,
    createdAt: e.createdAt.toISOString(),
  };
}

/**
 * Registro do que o JARVIS faz e do estado do núcleo.
 * Usado pela API e pelos workers; a entrega ao navegador é feita via Redis pub/sub,
 * então um worker em outro processo atualiza o HUD em tempo real.
 */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async record(userId: string, input: RecordEventInput): Promise<AgentEventDto> {
    const event = await this.prisma.agentEvent.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        level: input.level ?? 'info',
        detail: input.detail ?? null,
        subject: input.subject ?? null,
        taskId: input.taskId ?? null,
      },
    });
    const dto = toEventDto(event);
    await this.publish(userId, { kind: 'event', event: dto });
    return dto;
  }

  async setState(userId: string, state: AgentState, label?: string | null): Promise<void> {
    const snapshot: AgentStateSnapshot = {
      state,
      label: label ?? AGENT_STATE_LABEL[state],
      updatedAt: new Date().toISOString(),
    };
    await this.redis.client.set(stateKey(userId), JSON.stringify(snapshot), 'EX', STATE_TTL_SECONDS);
    await this.publish(userId, { kind: 'state', snapshot });
  }

  async getState(userId: string): Promise<AgentStateSnapshot> {
    const raw = await this.redis.client.get(stateKey(userId));
    if (raw) return JSON.parse(raw) as AgentStateSnapshot;
    return { state: 'idle', label: AGENT_STATE_LABEL.idle, updatedAt: new Date().toISOString() };
  }

  async list(userId: string, opts: { limit: number; before?: Date }): Promise<AgentEventDto[]> {
    const events = await this.prisma.agentEvent.findMany({
      where: { userId, ...(opts.before ? { createdAt: { lt: opts.before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
    });
    return events.map(toEventDto);
  }

  countSince(userId: string, since: Date): Promise<number> {
    return this.prisma.agentEvent.count({ where: { userId, createdAt: { gte: since } } });
  }

  private async publish(userId: string, message: StreamMessage) {
    await this.redis.client.publish(userChannel(userId), JSON.stringify(message));
  }
}
