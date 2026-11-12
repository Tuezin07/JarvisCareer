import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '@jarvis/shared';

export const IS_PUBLIC = 'jarvis:isPublic';

/** Rota acessível sem sessão. Todo o resto exige autenticação por padrão. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthUser {
  id: string;
  role: UserRole;
}

export type AuthedRequest = Request & { user?: AuthUser };

/** Usuário autenticado, sempre derivado do token — nunca do corpo ou da URL. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new Error('CurrentUser usado em rota pública');
  return req.user;
});
