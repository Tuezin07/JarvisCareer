import { describe, expect, it } from 'vitest';
import {
  computeProfileCompleteness,
  preferencesSchema,
  profileSchema,
  registerSchema,
} from './index.js';

describe('computeProfileCompleteness', () => {
  const empty = {
    hasPreferences: false,
    experienceCount: 0,
    educationCount: 0,
    skillCount: 0,
    resumeCount: 0,
  };

  it('perfil vazio é 0% e lista tudo o que falta', () => {
    const r = computeProfileCompleteness(empty);
    expect(r.percent).toBe(0);
    expect(r.missing).toHaveLength(10);
  });

  it('cidade sem estado não conta', () => {
    const r = computeProfileCompleteness({ ...empty, fullName: 'Ana', city: 'Curitiba' });
    expect(r.percent).toBe(10);
    expect(r.missing).toContain('Cidade e estado');
  });

  it('perfil completo é 100%', () => {
    const r = computeProfileCompleteness({
      fullName: 'Ana',
      phone: '41999990000',
      city: 'Curitiba',
      state: 'PR',
      headline: 'Desenvolvedora júnior',
      targetRoles: ['Desenvolvedora'],
      hasPreferences: true,
      experienceCount: 1,
      educationCount: 1,
      skillCount: 3,
      resumeCount: 1,
    });
    expect(r).toEqual({ percent: 100, missing: [] });
  });
});

describe('schemas', () => {
  it('registro exige aceite de termos e privacidade', () => {
    const r = registerSchema.safeParse({
      fullName: 'Ana Souza',
      email: 'ANA@Example.com ',
      password: 'senha-forte-123',
      acceptTerms: true,
      acceptPrivacy: false,
    });
    expect(r.success).toBe(false);
  });

  it('registro normaliza o e-mail', () => {
    const r = registerSchema.parse({
      fullName: 'Ana Souza',
      email: ' ANA@Example.com ',
      password: 'senha-forte-123',
      acceptTerms: true,
      acceptPrivacy: true,
    });
    expect(r.email).toBe('ana@example.com');
  });

  it('restrição de salário mínimo exige valor', () => {
    const bad = preferencesSchema.safeParse({
      constraints: [{ kind: 'MIN_SALARY', strength: 'ELIMINATORY' }],
    });
    expect(bad.success).toBe(false);
    const ok = preferencesSchema.parse({
      constraints: [{ kind: 'MIN_SALARY', strength: 'ELIMINATORY', value: 2500 }],
    });
    expect(ok.constraints[0]).toMatchObject({ kind: 'MIN_SALARY', value: 2500 });
  });

  it('texto vazio no perfil vira null', () => {
    const r = profileSchema.parse({ fullName: 'Ana Souza', phone: '' });
    expect(r.phone).toBeNull();
    expect(r.targetRoles).toEqual([]);
  });
});
