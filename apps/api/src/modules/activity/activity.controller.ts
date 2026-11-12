import { Controller, Get, type MessageEvent, Query, Sse } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { z } from 'zod';
import type { AgentEventDto, AgentStateSnapshot, StreamMessage } from '@jarvis/shared';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import { ActivityStreamService } from './activity-stream.service.js';
import { ActivityService } from './activity.service.js';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.coerce.date().optional(),
});
type ListQuery = z.infer<typeof listQuerySchema>;

const HEARTBEAT_MS = 25_000;

@Controller('activity')
export class ActivityController {
  constructor(
    private readonly activity: ActivityService,
    private readonly stream: ActivityStreamService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query({ schema: listQuerySchema }) q: ListQuery): Promise<AgentEventDto[]> {
    return this.activity.list(user.id, { limit: q.limit, before: q.before });
  }

  @Get('state')
  state(@CurrentUser() user: AuthUser): Promise<AgentStateSnapshot> {
    return this.activity.getState(user.id);
  }

  /** Canal em tempo real do HUD: estado atual primeiro, depois cada mudança e evento. */
  @SkipThrottle()
  @Sse('stream')
  events(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const send = (message: StreamMessage) => subscriber.next({ data: message });

      void this.activity.getState(user.id).then((snapshot) => send({ kind: 'state', snapshot }));
      const unsubscribe = this.stream.subscribe(user.id, send);
      const heartbeat = setInterval(() => send({ kind: 'ping', at: new Date().toISOString() }), HEARTBEAT_MS);

      return () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    });
  }
}
