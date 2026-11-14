import type { AutomationProfile, FormField } from '@jarvis/shared';
import { describe, expect, it } from 'vitest';
import { mapFields } from './inspect.ts';

/** Regras de mapeamento (puras). Casos vindos de formulários reais de ATS. */
const profile: AutomationProfile = {
  fullName: 'Ana Souza',
  firstName: 'Ana',
  lastName: 'Souza',
  email: 'ana@example.com',
  phone: null,
  city: 'Curitiba',
  state: 'PR',
};

const field = (label: string, over: Partial<FormField> = {}): FormField => ({ key: label, label, type: 'text', required: true, ...over });
const one = (f: FormField, p: AutomationProfile | undefined = profile, hasResume = true) => mapFields([f], p, hasResume)[0];

describe('mapFields', () => {
  it('nunca usa os dados do candidato em perguntas sobre outra pessoa', () => {
    const m = one(field('Caso seja indicação, informe o e-mail corporativo da pessoa que te indicou.', { required: false }));
    expect(m.status).toBe('SKIPPED');
    expect(m.reason).toContain('outra pessoa');
    expect(one(field('Nome do colaborador que te indicou')).status).toBe('NEEDS_HUMAN');
  });

  it('"Nome da empresa" não é o nome do candidato', () => {
    expect(one(field('Nome da empresa atual')).status).toBe('NEEDS_HUMAN');
    expect(one(field('E-mail da empresa')).source).toBeNull();
    expect(one(field('Telefone do pai')).source).toBeNull();
    expect(one(field('Nome')).source).toBe('perfil.nome');
    expect(one(field('País')).reason).toContain('perfil.pais'); // "pai" não casa dentro de "país"
  });

  it('autocomplete da página tem prioridade sobre o rótulo', () => {
    expect(one(field('Primeiro campo', { autocomplete: 'given-name' })).source).toBe('perfil.nome');
    expect(one(field('Contato', { autocomplete: 'email' })).source).toBe('perfil.email');
  });

  it('documentos, salário, acessibilidade e consentimento ficam com a pessoa', () => {
    expect(one(field('Qual é o seu CPF? (Formato: XXX.XXX.XXX-XX)')).reason).toContain('Documento pessoal');
    expect(one(field('Qual sua pretensão salarial?', { type: 'checkbox-group' })).reason).toContain('Pretensão salarial');
    expect(one(field('Você precisa de alguma adaptação de acessibilidade?', { required: false })).status).toBe('SKIPPED');
    expect(one(field('Você é uma pessoa com deficiência?')).reason).toContain('sensível');
    expect(one(field('Eu concordo com a coleta e uso dessas informações', { type: 'checkbox', required: false })).status).toBe('NEEDS_HUMAN');
  });

  it('perguntas de escolha nunca são respondidas pelo JARVIS', () => {
    const m = one(field('Como você conheceu a empresa?', { type: 'checkbox-group', options: ['Redes sociais', 'Outro'] }));
    expect(m).toMatchObject({ status: 'NEEDS_HUMAN', source: null });
  });

  it('dado ausente no perfil não é inventado', () => {
    expect(one(field('Telefone', { type: 'tel' }))).toMatchObject({ status: 'NEEDS_HUMAN', source: null });
    expect(one(field('País', { type: 'combobox' })).reason).toContain('não está no seu perfil');
    expect(one(field('Currículo/CV', { type: 'file' }), profile, false).reason).toContain('ainda não tem currículo');
  });

  it('combobox de cidade usa o perfil, avisando que a sugestão precisa ser escolhida', () => {
    const m = one(field('Localização (Cidade)', { type: 'combobox' }));
    expect(m).toMatchObject({ status: 'AUTO', source: 'perfil.cidade' });
    expect(m.reason).toContain('sugestão');
  });
});
