import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';

/**
 * Conexões Redis fora do BullMQ: comandos comuns (estado do agente, publicação)
 * e assinaturas pub/sub, que exigem uma conexão dedicada.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly subscribers: Redis[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    this.client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
  }

  createSubscriber(): Redis {
    const sub = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.subscribers.push(sub);
    return sub;
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.client.quit(), ...this.subscribers.map((s) => s.quit())]);
  }
}
