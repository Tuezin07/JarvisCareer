import { Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ResumeAnalysisDto, UsageSummaryDto } from '@jarvis/shared';
import { type AuthUser, CurrentUser } from '../../common/auth/auth.decorators.js';
import { ENV, type Env } from '../../config/env.js';
import { ResumeAnalysisService } from './analysis/resume-analysis.service.js';
import { LLM_PROVIDER, type LlmProvider } from './llm/llm-provider.js';
import { UsageService } from './llm/usage.service.js';

@Controller()
export class IntelligenceController {
  constructor(
    private readonly analysis: ResumeAnalysisService,
    private readonly usage: UsageService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Se a IA está disponível, qual modelo responde e quanto o candidato consumiu. */
  @Get('intelligence/status')
  async status(@CurrentUser() user: AuthUser): Promise<{ configured: boolean; model: string; usage: UsageSummaryDto }> {
    return { configured: this.llm.configured, model: this.env.LLM_MODEL_PRIMARY, usage: await this.usage.summary(user.id) };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('resumes/:id/analysis')
  @HttpCode(202)
  request(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ResumeAnalysisDto> {
    return this.analysis.request(user.id, id);
  }

  @Get('resumes/:id/analysis')
  latest(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ResumeAnalysisDto | null> {
    return this.analysis.latest(user.id, id);
  }
}
