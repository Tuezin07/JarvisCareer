import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { StreamMessage } from '@jarvis/shared';
import { RedisService } from '../../common/redis.service.js';
import { userChannel } from './activity.service.js';

type Listener = (message: StreamMessage) => void;

/**
 * Uma única conexão de assinatura por processo da API, com contagem de referências
 * por candidato: o canal Redis só é assinado enquanto houver uma aba aberta.
 */
@Injectable()
export class ActivityStreamService implements OnModuleInit {
  private readonly logger = new Logger(ActivityStreamService.name);
  private subscriber!: Redis;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(private readonly redis: RedisService) {}

  onModuleInit() {
    this.subscriber = this.redis.createSubscriber();
    this.subscriber.on('message', (channel: string, payload: string) => {
      const userId = channel.slice('jarvis:user:'.length);
      const set = this.listeners.get(userId);
      if (!set) return;
      let message: StreamMessage;
      try {
        message = JSON.parse(payload) as StreamMessage;
      } catch {
        this.logger.warn(`Mensagem inválida no canal ${channel}`);
        return;
      }
      for (const listener of set) listener(message);
    });
  }

  subscribe(userId: string, listener: Listener): () => void {
    let set = this.listeners.get(userId);
    if (!set) {
      set = new Set();
      this.listeners.set(userId, set);
      void this.subscriber.subscribe(userChannel(userId));
    }
    set.add(listener);

    return () => {
      const current = this.listeners.get(userId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(userId);
        void this.subscriber.unsubscribe(userChannel(userId));
      }
    };
  }
}
