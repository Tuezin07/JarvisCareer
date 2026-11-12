import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '@jarvis/shared';
import { type AuthedRequest, IS_PUBLIC } from './auth.decorators.js';

export const ACCESS_COOKIE = 'jarvis_at';
export const REFRESH_COOKIE = 'jarvis_rt';

interface AccessPayload {
  sub: string;
  role: UserRole;
}

/** Guard global: autentica pelo cookie httpOnly (navegador) ou Bearer (clientes de API). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = this.extract(req);
    if (!token) throw new UnauthorizedException('Sessão ausente');

    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, { algorithms: ['HS256'] });
      req.user = { id: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException('Sessão expirada ou inválida');
    }
  }

  private extract(req: AuthedRequest): string | null {
    const cookie = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    if (cookie) return cookie;
    const header = req.get('authorization');
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return null;
  }
}
