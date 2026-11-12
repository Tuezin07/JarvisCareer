import { ConflictException, Inject, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { LEGAL_TEXT_VERSION, type LoginInput, type MeResponse, type RegisterInput } from '@jarvis/shared';
import { AuditService, type RequestMeta } from '../../common/audit.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ENV, type Env } from '../../config/env.js';
import type { User } from '../../generated/prisma/client.js';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessMaxAgeMs: number;
  refreshMaxAgeMs: number;
}

/** Reuso de refresh dentro desta janela é tratado como corrida entre abas, não como roubo. */
const REUSE_GRACE_MS = 15_000;

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function toMe(user: Pick<User, 'id' | 'email' | 'role' | 'createdAt'>, fullName: string): MeResponse {
  return {
    id: user.id,
    email: user.email,
    fullName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class AuthService implements OnModuleInit {
  /** Hash usado quando o e-mail não existe, para o tempo de resposta não revelar contas. */
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit() {
    this.dummyHash = await argon2.hash(randomBytes(16).toString('hex'), { type: argon2.argon2id });
  }

  async register(input: RegisterInput, meta: RequestMeta): Promise<{ me: MeResponse; tokens: IssuedTokens }> {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (exists) throw new ConflictException('Já existe uma conta com este e-mail');

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        profile: { create: { fullName: input.fullName, targetRoles: [], regionsOfInterest: [] } },
        consents: {
          create: [
            { type: 'TERMS', granted: true, version: LEGAL_TEXT_VERSION, ip: meta.ip, userAgent: meta.userAgent },
            { type: 'PRIVACY', granted: true, version: LEGAL_TEXT_VERSION, ip: meta.ip, userAgent: meta.userAgent },
          ],
        },
      },
    });

    await this.audit.log('auth.register', { userId: user.id, meta });
    const tokens = await this.issueTokens(user, randomUUID(), meta);
    return { me: toMe(user, input.fullName), tokens };
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<{ me: MeResponse; tokens: IssuedTokens }> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { profile: { select: { fullName: true } } },
    });
    const valid = await argon2.verify(user?.passwordHash ?? this.dummyHash, input.password);
    if (!user || !valid) {
      await this.audit.log('auth.login_failed', { userId: user?.id ?? null, meta });
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log('auth.login', { userId: user.id, meta });
    const tokens = await this.issueTokens(user, randomUUID(), meta);
    return { me: toMe(user, user.profile?.fullName ?? ''), tokens };
  }

  /** Rotação: cada refresh é de uso único. Reuso fora da janela de graça revoga a família. */
  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<IssuedTokens> {
    if (!rawToken) throw new UnauthorizedException('Sessão ausente');
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: true },
    });
    if (!stored) throw new UnauthorizedException('Sessão inválida');

    if (stored.revokedAt) {
      const sinceRevoked = Date.now() - stored.revokedAt.getTime();
      if (sinceRevoked > REUSE_GRACE_MS) {
        await this.prisma.refreshToken.updateMany({
          where: { familyId: stored.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await this.audit.log('auth.refresh_reuse_detected', { userId: stored.userId, meta });
        throw new UnauthorizedException('Sessão revogada');
      }
    }
    if (stored.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('Sessão expirada');

    const tokens = await this.issueTokens(stored.user, stored.familyId, meta);
    if (!stored.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
    }
    return tokens;
  }

  async logout(rawToken: string | undefined, userId: string | null, meta: RequestMeta): Promise<void> {
    if (rawToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: sha256(rawToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.log('auth.logout', { userId, meta });
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: { select: { fullName: true } } },
    });
    if (!user) throw new UnauthorizedException('Conta não encontrada');
    return toMe(user, user.profile?.fullName ?? '');
  }

  private async issueTokens(user: Pick<User, 'id' | 'role'>, familyId: string, meta: RequestMeta): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshMaxAgeMs = this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + refreshMaxAgeMs),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return {
      accessToken,
      refreshToken,
      accessMaxAgeMs: this.env.ACCESS_TOKEN_TTL_SECONDS * 1000,
      refreshMaxAgeMs,
    };
  }
}
