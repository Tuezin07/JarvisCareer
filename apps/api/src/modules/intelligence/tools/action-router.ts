import { Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { ToolActivity } from '@jarvis/shared';
import { AuditService } from '../../../common/audit.service.js';
import { PrismaService } from '../../../common/prisma.service.js';
import type { ActionRisk, ActionStatus } from '../../../generated/prisma/client.js';
import { CareerToolsService } from './career-tools.service.js';
import type { ToolContext, ToolDefinition } from './tool.types.js';

/** Riscos que a conversa pode executar sem aprovação. O resto exige aprovação humana (Fase 5). */
const ALLOWED_WITHOUT_APPROVAL: ReadonlySet<ActionRisk> = new Set(['READ_ONLY', 'REVERSIBLE']);
const TOOL_TIMEOUT_MS = 30_000;
const DAY_MS = 24 * 3600 * 1000;

export interface ToolUseRequest {
  id: string;
  name: string;
  input: unknown;
}

export interface RoutedResult {
  result: Anthropic.Beta.BetaToolResultBlockParam;
  activity: ToolActivity;
}

/** Converte o schema Zod no JSON Schema que a API espera em `input_schema`. */
export function toInputSchema(schema: z.ZodType): Anthropic.Beta.BetaTool.InputSchema {
  const json = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
  delete json.$schema;
  return json as Anthropic.Beta.BetaTool.InputSchema;
}

/** Remove textos longos antes de persistir a entrada da ferramenta. */
function compactInput(input: unknown): unknown {
  return JSON.parse(
    JSON.stringify(input ?? null, (_k, v: unknown) => (typeof v === 'string' && v.length > 500 ? `${v.slice(0, 500)}…` : v)),
  );
}

/**
 * Ponto único entre o que o modelo pede e o que o sistema executa.
 * Valida a entrada, aplica política de risco e limites, executa com tempo limite
 * e registra tudo. O modelo não decide permissões.
 */
@Injectable()
export class ActionRouter {
  private readonly logger = new Logger(ActionRouter.name);
  private readonly tools: Map<string, ToolDefinition>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    career: CareerToolsService,
  ) {
    this.tools = new Map(career.tools().map((t) => [t.name, t]));
  }

  /** Definições em ordem estável (o cache de prompt depende de bytes idênticos). */
  definitions(): Anthropic.Beta.BetaTool[] {
    return [...this.tools.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({ name: t.name, description: t.description, input_schema: toInputSchema(t.input) }));
  }

  labelFor(name: string): string {
    return this.tools.get(name)?.label ?? name;
  }

  async execute(ctx: ToolContext, use: ToolUseRequest): Promise<RoutedResult> {
    const started = Date.now();
    const tool = this.tools.get(use.name);

    const finish = async (
      status: ActionStatus,
      payload: { content: string; isError: boolean; summary: string; error?: string },
      risk: ActionRisk = tool?.risk ?? 'READ_ONLY',
    ): Promise<RoutedResult> => {
      await this.prisma.actionExecution.create({
        data: {
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          toolUseId: use.id,
          toolName: use.name,
          risk,
          status,
          input: compactInput(use.input) as object,
          summary: payload.summary,
          error: payload.error ?? null,
          durationMs: Date.now() - started,
        },
      });
      if (risk !== 'READ_ONLY' || status === 'DENIED') {
        await this.audit.log('agent.tool', { userId: ctx.userId, metadata: { tool: use.name, status, risk } });
      }
      return {
        result: { type: 'tool_result', tool_use_id: use.id, content: payload.content, is_error: payload.isError || undefined },
        activity: {
          toolUseId: use.id,
          name: use.name,
          label: this.labelFor(use.name),
          status: status === 'SUCCEEDED' ? 'succeeded' : status === 'DENIED' ? 'denied' : 'failed',
          summary: payload.summary,
        },
      };
    };

    if (!tool) {
      return finish('FAILED', { content: `Ferramenta desconhecida: ${use.name}`, isError: true, summary: 'Ferramenta inexistente' });
    }

    const parsed = tool.input.safeParse(use.input ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; ');
      return finish('FAILED', {
        content: `Entrada inválida para ${tool.name}: ${issues}. Corrija e tente de novo.`,
        isError: true,
        summary: 'Entrada inválida',
        error: issues,
      });
    }

    if (!ALLOWED_WITHOUT_APPROVAL.has(tool.risk)) {
      return finish('DENIED', {
        content: 'Ação bloqueada pela política: exige aprovação explícita do candidato, que ainda não está disponível.',
        isError: true,
        summary: 'Bloqueada: requer aprovação humana',
      });
    }

    if (tool.dailyLimit) {
      const used = await this.prisma.actionExecution.count({
        where: { userId: ctx.userId, toolName: tool.name, status: 'SUCCEEDED', createdAt: { gte: new Date(Date.now() - DAY_MS) } },
      });
      if (used >= tool.dailyLimit) {
        return finish('DENIED', {
          content: `Limite diário desta ação atingido (${tool.dailyLimit} em 24 h). Informe o candidato.`,
          isError: true,
          summary: 'Limite diário atingido',
        });
      }
    }

    let timer: NodeJS.Timeout | undefined;
    try {
      const outcome = await Promise.race([
        tool.run(ctx, parsed.data),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Tempo limite de ${TOOL_TIMEOUT_MS / 1000}s excedido`)), TOOL_TIMEOUT_MS);
        }),
      ]);
      return finish('SUCCEEDED', { content: JSON.stringify(outcome.content), isError: false, summary: outcome.summary });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(`Ferramenta ${tool.name} falhou: ${message}`);
      return finish('FAILED', { content: `Falha ao executar ${tool.name}: ${message}`, isError: true, summary: 'Falhou', error: message });
    } finally {
      clearTimeout(timer);
    }
  }
}
