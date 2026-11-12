import { z } from 'zod';

/** Versão dos textos legais aceitos no cadastro. Mudou o texto, mude a versão. */
export const LEGAL_TEXT_VERSION = '2026-11-v0.1';

export const passwordSchema = z
  .string()
  .min(10, 'A senha precisa ter pelo menos 10 caracteres')
  .max(128, 'A senha pode ter no máximo 128 caracteres');

/** Normaliza antes de validar: no Zod 4, z.email().trim() checaria o formato antes de aparar. */
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { error: 'É necessário aceitar os termos de uso' }),
  acceptPrivacy: z.literal(true, { error: 'É necessário aceitar a política de privacidade' }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const userRoleSchema = z.enum(['CANDIDATE', 'ADMIN']);
export type UserRole = z.infer<typeof userRoleSchema>;

export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: string;
}
