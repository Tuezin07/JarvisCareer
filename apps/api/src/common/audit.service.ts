import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from './prisma.service.js';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export function requestMeta(req: Request): RequestMeta {
  return {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
  };
}

const SENSITIVE_KEYS = /pass|token|secret|authorization|cookie|text|content/i;

/** Remove campos sensíveis antes de persistir metadados de auditoria. */
export function redact(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([k, v]) => [k, SENSITIVE_KEYS.test(k) ? '[redacted]' : v]),
  );
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  /** Auditoria nunca derruba a operação principal: falha é logada e segue. */
  async log(
    action: string,
    opts: { userId?: string | null; metadata?: Record<string, unknown>; meta?: RequestMeta } = {},
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          userId: opts.userId ?? null,
          metadata: opts.metadata ? (redact(opts.metadata) as object) : undefined,
          ip: opts.meta?.ip ?? null,
          userAgent: opts.meta?.userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Falha ao gravar auditoria ${action}: ${(err as Error).message}`);
    }
  }
}
