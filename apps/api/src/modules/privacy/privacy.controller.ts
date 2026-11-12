import { Body, Controller, Get, Header, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { consentChangeSchema, deleteAccountSchema, type ConsentDto } from '@jarvis/shared';
import { requestMeta } from '../../common/audit.service.js';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../common/auth/jwt-auth.guard.js';
import { PrivacyService } from './privacy.service.js';

@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('consents')
  consents(@CurrentUser() user: AuthUser): Promise<ConsentDto[]> {
    return this.privacy.consents(user.id);
  }

  @Post('consents')
  @HttpCode(200)
  change(
    @CurrentUser() user: AuthUser,
    @Body({ schema: consentChangeSchema }) body: z.infer<typeof consentChangeSchema>,
    @Req() req: Request,
  ): Promise<ConsentDto[]> {
    return this.privacy.changeConsent(user.id, body.type, body.granted, requestMeta(req));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('export')
  @Header('Content-Disposition', 'attachment; filename="jarvis-career-meus-dados.json"')
  @Header('Cache-Control', 'no-store')
  export(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.privacy.export(user.id, requestMeta(req));
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('delete-account')
  @HttpCode(204)
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body({ schema: deleteAccountSchema }) body: z.infer<typeof deleteAccountSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.privacy.deleteAccount(user.id, body.password, requestMeta(req));
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }
}
