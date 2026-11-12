import { Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { LEGAL_TEXT_VERSION, type ConsentDto, type ConsentType } from '@jarvis/shared';
import { AuditService, type RequestMeta } from '../../common/audit.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { StorageService } from '../../common/storage.service.js';
import { ActivityService } from '../activity/activity.service.js';

const CONSENT_LABEL: Record<ConsentType, string> = {
  TERMS: 'Termos de uso',
  PRIVACY: 'Política de privacidade',
  AUTOMATED_APPLICATIONS: 'Envio automatizado de candidaturas',
  EVIDENCE_SCREENSHOTS: 'Screenshots como evidência',
};

/** Direitos do titular (LGPD art. 18): consentimentos, portabilidade e eliminação. */
@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
  ) {}

  /** Estado vigente de cada consentimento = último registro daquele tipo. */
  async consents(userId: string): Promise<ConsentDto[]> {
    const rows = await this.prisma.consent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    const latest = new Map<ConsentType, ConsentDto>();
    for (const r of rows) {
      if (!latest.has(r.type)) {
        latest.set(r.type, { type: r.type, granted: r.granted, version: r.version, changedAt: r.createdAt.toISOString() });
      }
    }
    return [...latest.values()];
  }

  async changeConsent(userId: string, type: ConsentType, granted: boolean, meta: RequestMeta): Promise<ConsentDto[]> {
    await this.prisma.consent.create({
      data: { userId, type, granted, version: LEGAL_TEXT_VERSION, ip: meta.ip, userAgent: meta.userAgent },
    });
    await this.audit.log(granted ? 'consent.grant' : 'consent.revoke', { userId, meta, metadata: { type } });
    await this.activity.record(userId, {
      type: 'consent.changed',
      level: granted ? 'info' : 'warning',
      title: `${CONSENT_LABEL[type]}: ${granted ? 'autorizado' : 'revogado'}`,
    });
    return this.consents(userId);
  }

  async export(userId: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
        profile: true,
        preferences: true,
        experiences: true,
        education: true,
        skills: { include: { skill: true } },
        resumes: { omit: { storageKey: true } },
        consents: { omit: { userId: true } },
        events: { orderBy: { createdAt: 'desc' }, omit: { userId: true } },
        tasks: { omit: { userId: true } },
        conversations: {
          select: {
            id: true,
            title: true,
            createdAt: true,
            messages: { orderBy: { seq: 'asc' }, select: { role: true, kind: true, displayText: true, createdAt: true } },
          },
        },
        memories: { omit: { userId: true } },
        analyses: { omit: { userId: true } },
        actions: { omit: { userId: true } },
        usage: { omit: { userId: true } },
      },
    });
    await this.audit.log('privacy.export', { userId, meta });
    return { exportedAt: new Date().toISOString(), format: 'jarvis-career-export/v1', data: user };
  }

  async deleteAccount(userId: string, password: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Senha incorreta');
    }
    await this.storage.deletePrefix(`users/${userId}/`);
    await this.prisma.user.delete({ where: { id: userId } });
    // AuditLog não tem FK para User e sobrevive à exclusão, sem dados pessoais.
    await this.audit.log('account.deleted', { userId, meta });
  }
}
