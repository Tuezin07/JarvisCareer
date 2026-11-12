import { z } from 'zod';

export const consentTypeSchema = z.enum([
  'TERMS',
  'PRIVACY',
  /** Permite que o JARVIS envie candidaturas em nome do candidato (Fase 5). */
  'AUTOMATED_APPLICATIONS',
  /** Permite guardar screenshots como evidência de operações (Fase 4). */
  'EVIDENCE_SCREENSHOTS',
]);
export type ConsentType = z.infer<typeof consentTypeSchema>;

export const consentChangeSchema = z.object({
  type: z.enum(['AUTOMATED_APPLICATIONS', 'EVIDENCE_SCREENSHOTS']),
  granted: z.boolean(),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
  confirmation: z.literal('EXCLUIR', { error: 'Digite EXCLUIR para confirmar' }),
});

export interface ConsentDto {
  type: ConsentType;
  granted: boolean;
  version: string;
  changedAt: string;
}
