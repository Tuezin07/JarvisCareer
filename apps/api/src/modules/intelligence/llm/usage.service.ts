import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import type { UsageSummaryDto } from '@jarvis/shared';
import { PrismaService } from '../../../common/prisma.service.js';
import { ENV, type Env } from '../../../config/env.js';
import { costMicroUsd } from './pricing.js';

const DAY_MS = 24 * 3600 * 1000;

export class BudgetExceededError extends HttpException {
  constructor(spentUsd: number, budgetUsd: number) {
    super(
      `Limite de uso de IA das últimas 24 horas atingido (US$ ${spentUsd.toFixed(2)} de US$ ${budgetUsd.toFixed(2)}). ` +
        'As operações de IA voltam automaticamente quando a janela liberar.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** Consumo e orçamento de LLM por candidato (janela móvel de 24 h). */
@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async record(
    userId: string,
    route: string,
    message: Pick<Anthropic.Beta.BetaMessage, 'model' | 'usage'>,
    conversationId?: string | null,
  ): Promise<number> {
    const cost = costMicroUsd(message.model, message.usage, this.env.LLM_MODEL_PRIMARY);
    await this.prisma.usageRecord.create({
      data: {
        userId,
        route,
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        costMicroUsd: cost,
        conversationId: conversationId ?? null,
      },
    });
    return cost;
  }

  async spentUsd(userId: string, sinceMs: number): Promise<number> {
    const agg = await this.prisma.usageRecord.aggregate({
      where: { userId, createdAt: { gte: new Date(Date.now() - sinceMs) } },
      _sum: { costMicroUsd: true },
    });
    return (agg._sum.costMicroUsd ?? 0) / 1_000_000;
  }

  /** Bloqueia novas chamadas quando o candidato atingiu o teto diário. */
  async assertWithinBudget(userId: string): Promise<void> {
    const spent = await this.spentUsd(userId, DAY_MS);
    if (spent >= this.env.LLM_DAILY_BUDGET_USD) throw new BudgetExceededError(spent, this.env.LLM_DAILY_BUDGET_USD);
  }

  async summary(userId: string): Promise<UsageSummaryDto> {
    const [today, month] = await Promise.all([this.spentUsd(userId, DAY_MS), this.spentUsd(userId, 30 * DAY_MS)]);
    return { todayUsd: today, dailyBudgetUsd: this.env.LLM_DAILY_BUDGET_USD, last30dUsd: month };
  }
}
