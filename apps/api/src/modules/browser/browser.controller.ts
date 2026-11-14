import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { BrowserCapabilitiesDto, BrowserSessionDto } from '@jarvis/shared';
import { requestMeta } from '../../common/audit.service.js';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import { BrowserService } from './browser.service.js';

const inspectBody = z.object({ jobId: z.string().uuid() });

@Controller('browser')
export class BrowserController {
  constructor(private readonly browser: BrowserService) {}

  @Get('capabilities')
  capabilities(@CurrentUser() user: AuthUser): Promise<BrowserCapabilitiesDto> {
    return this.browser.capabilities(user.id);
  }

  @Get('sessions')
  list(@CurrentUser() user: AuthUser): Promise<BrowserSessionDto[]> {
    return this.browser.list(user.id);
  }

  @Get('sessions/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<BrowserSessionDto> {
    return this.browser.get(user.id, id);
  }

  /** Serve a captura só para o dono, sem cache compartilhado. */
  @Get('sessions/:id/evidence/:evidenceId')
  async evidence(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.browser.evidenceFile(user.id, id, evidenceId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // O HUD roda em outra origem do mesmo site (outra porta/subdomínio); o Helmet
    // padrão (same-origin) impediria o <img>. O acesso continua exigindo o cookie do dono.
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.end(file.data);
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('inspect')
  @HttpCode(202)
  inspect(@CurrentUser() user: AuthUser, @Body({ schema: inspectBody }) body: z.infer<typeof inspectBody>, @Req() req: Request) {
    return this.browser.inspectJob(user.id, body.jobId, requestMeta(req));
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('test-form')
  @HttpCode(202)
  testForm(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.browser.fillTestForm(user.id, requestMeta(req));
  }

  /** Parada imediata da sessão. */
  @Post('sessions/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.browser.cancel(user.id, id, requestMeta(req));
  }
}
