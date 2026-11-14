import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import {
  followSourceSchema,
  importJobSchema,
  jobMatchStatusSchema,
  jobsQuerySchema,
  type JobDetailDto,
  type JobsListResponse,
  type JobsQuery,
  type JobSourceDto,
} from '@jarvis/shared';
import { requestMeta } from '../../common/audit.service.js';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import { JobsService } from './jobs.service.js';

const statusBody = z.object({ status: jobMatchStatusSchema });

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get('sources')
  sources(@CurrentUser() user: AuthUser): Promise<JobSourceDto[]> {
    return this.jobs.sources(user.id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('sources')
  follow(
    @CurrentUser() user: AuthUser,
    @Body({ schema: followSourceSchema }) body: z.infer<typeof followSourceSchema>,
    @Req() req: Request,
  ): Promise<JobSourceDto> {
    return this.jobs.follow(user.id, body.url, requestMeta(req));
  }

  @Delete('sources/:id')
  @HttpCode(204)
  unfollow(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<void> {
    return this.jobs.unfollow(user.id, id, requestMeta(req));
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('sources/:id/sync')
  @HttpCode(202)
  async sync(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<{ status: 'QUEUED' }> {
    await this.jobs.syncNow(user.id, id);
    return { status: 'QUEUED' };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('import')
  @HttpCode(202)
  import(@CurrentUser() user: AuthUser, @Body({ schema: importJobSchema }) body: z.infer<typeof importJobSchema>) {
    return this.jobs.importJob(user.id, body.url);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query({ schema: jobsQuerySchema }) q: JobsQuery): Promise<JobsListResponse> {
    return this.jobs.list(user.id, q);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<JobDetailDto> {
    return this.jobs.detail(user.id, id);
  }

  @Post(':id/status')
  @HttpCode(200)
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: statusBody }) body: z.infer<typeof statusBody>,
  ): Promise<JobDetailDto> {
    return this.jobs.setStatus(user.id, id, body.status);
  }
}
