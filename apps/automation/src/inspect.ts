import type { AutomationProfile, Blocker, FieldMapping, FormField } from '@jarvis/shared';
import type { Frame, Page } from 'playwright';

export const KEY_ATTR = 'data-jarvis-key';

/**
 * Lista os controles de formulário visíveis da página (e de iframes do mesmo documento),
 * com o rótulo acessível de cada um. Marca cada controle com um atributo local para
 * poder preenchê-lo depois sem depender de classes CSS frágeis.
 */
export async function extractFields(page: Page): Promise<Array<FormField & { frameIndex: number }>> {
  const out: Array<FormField & { frameIndex: number }> = [];
  const frames = page.frames();
  for (let i = 0; i < frames.length; i++) {
    const fields = await extractFromFrame(frames[i], i).catch(() => []);
    out.push(...fields.map((f) => ({ ...f, frameIndex: i })));
  }
  return out.slice(0, 80);
}

async function extractFromFrame(frame: Frame, frameIndex: number): Promise<FormField[]> {
  return frame.evaluate(
    ({ attr, prefix }) => {
      const textOf = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
      // Texto de botão que não diz o que o campo é ("Anexar", "Upload").
      const GENERIC = /^(anexar|attach|upload|carregar|enviar arquivo|selecionar arquivo|escolher arquivo|choose file|browse|procurar|selecione|select)?$/i;
      const isGeneric = (t: string) => GENERIC.test(t.replace(/\s*\*\s*$/, '').trim());

      const ownLabel = (el: HTMLElement): string => {
        const aria = el.getAttribute('aria-label');
        if (aria) return aria.trim();
        const by = el.getAttribute('aria-labelledby');
        if (by) {
          const t = by
            .split(/\s+/)
            .map((id) => textOf(document.getElementById(id)))
            .join(' ')
            .trim();
          if (t) return t;
        }
        if (el.id) {
          const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (l) return textOf(l);
        }
        const wrap = el.closest('label');
        return wrap ? textOf(wrap) : '';
      };
      // Rótulo do bloco que contém o controle (ex.: "Currículo/CV" acima do botão "Anexar"):
      // o último rótulo não genérico antes do controle, subindo no máximo 6 níveis. Para ao
      // chegar a um bloco com outro anexo, para a carta não herdar o rótulo do currículo.
      const blockLabel = (el: HTMLElement): string => {
        let a = el.parentElement;
        for (let depth = 0; a && depth < 6; depth++, a = a.parentElement) {
          if (a.querySelectorAll('input[type="file"]').length > 1) break;
          const before = Array.from(a.querySelectorAll('legend, label, [class*="label" i]')).filter(
            (c) => !c.contains(el) && (c.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
          );
          for (const c of before.reverse()) {
            const t = textOf(c);
            if (t && t.length <= 200 && !isGeneric(t)) return t;
          }
        }
        return '';
      };
      const labelOf = (el: HTMLElement): string => {
        const own = ownLabel(el);
        if (own && !isGeneric(own)) return own;
        const legend = textOf(el.closest('fieldset')?.querySelector('legend') ?? null);
        return blockLabel(el) || legend || own || (el.getAttribute('placeholder') ?? el.getAttribute('name') ?? '').trim();
      };
      const visible = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return s.visibility !== 'hidden' && s.display !== 'none' && (r.width > 0 || r.height > 0);
      };
      const isRequired = (el: HTMLElement) => (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true';

      const fields: Array<{
        key: string;
        label: string;
        type: string;
        required: boolean;
        options?: string[];
        accept?: string | null;
        autocomplete?: string | null;
      }> = [];
      const seenGroup = new Set<string>();
      let n = 0;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('input, select, textarea'))) {
        const tag = el.tagName.toLowerCase();
        let type = tag === 'input' ? ((el as HTMLInputElement).type || 'text').toLowerCase() : tag;
        if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;
        // Inputs de arquivo costumam ficar escondidos atrás de um botão customizado. Os demais
        // ocultos (ex.: o input auxiliar "required" de listas de seleção) não são campos.
        if (type !== 'file' && (!visible(el) || el.getAttribute('aria-hidden') === 'true')) continue;
        if (tag === 'input' && el.getAttribute('role') === 'combobox') type = 'combobox';

        let label = labelOf(el);
        let required = isRequired(el);
        let options: string[] | undefined;
        // Checkboxes/rádios com o mesmo name são UMA pergunta com opções, não vários campos.
        const name = (el as HTMLInputElement).name;
        if ((type === 'checkbox' || type === 'radio') && name) {
          const members = Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`)).filter((m) => m.name === name);
          if (type === 'radio' || members.length > 1) {
            if (seenGroup.has(name)) continue;
            seenGroup.add(name);
            const group = el.closest('fieldset, [role="group"], [role="radiogroup"]');
            label = textOf(group?.querySelector('legend') ?? null) || group?.getAttribute('aria-label') || blockLabel(el) || label;
            required = members.some(isRequired) || group?.getAttribute('aria-required') === 'true';
            options = members.map(ownLabel).slice(0, 30);
            type = `${type}-group`;
          }
        }

        const key = `${prefix}${n++}`;
        el.setAttribute(attr, key);
        label = label.slice(0, 200);
        required = required || /\*\s*$/.test(label);
        const field: (typeof fields)[number] = { key, label: label.replace(/\s*\*\s*$/, ''), type, required };
        if (options) field.options = options;
        if (tag === 'select') field.options = Array.from((el as HTMLSelectElement).options).map((o) => o.text.trim()).slice(0, 30);
        if (type === 'file') field.accept = (el as HTMLInputElement).accept || null;
        const ac = el.getAttribute('autocomplete');
        if (ac && ac !== 'on' && ac !== 'off') field.autocomplete = ac.toLowerCase();
        fields.push(field);
      }
      return fields;
    },
    { attr: KEY_ATTR, prefix: `f${frameIndex}_` },
  );
}

/** Sinais de que a página exige uma pessoa. O JARVIS nunca tenta contornar nenhum deles. */
export async function detectBlockers(page: Page): Promise<Blocker[]> {
  const blockers: Blocker[] = [];
  const captchaFrame = page.frames().find((f) => /recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|arkoselabs|funcaptcha/i.test(f.url()));
  const captchaEl = await page
    .locator('.g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]')
    .count()
    .catch(() => 0);
  if (captchaFrame || captchaEl > 0) {
    blockers.push({ kind: 'CAPTCHA', detail: 'A página usa verificação anti-robô (CAPTCHA). O envio exige uma pessoa; o JARVIS não tenta resolver nem contornar.' });
  }
  const password = await page.locator('input[type="password"]:visible').count().catch(() => 0);
  if (password > 0) blockers.push({ kind: 'LOGIN', detail: 'A página pede login com senha. O JARVIS não digita senhas; você entra na sua conta.' });
  const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 20_000);
  if (/(c[oó]digo de verifica[cç][aã]o|verification code|two-factor|autentica[cç][aã]o em dois|2fa)/i.test(body)) {
    blockers.push({ kind: 'MFA', detail: 'A página pede verificação em duas etapas. Só você pode concluir.' });
  }
  return blockers;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Campos de autodeclaração ou dados sensíveis (LGPD art. 11): o JARVIS nunca preenche. */
// Palavras inteiras: "idade" sem delimitador casaria com "cidade" e "privacidade".
const SENSITIVE =
  /\b(genero|gender|sexo|raca|race|etnia|ethnic\w*|hispanic|latino|deficiencia|disabilit\w*|pcd|acessibilidade|accessibility|accommodations?|veteran|pronomes?|pronouns?|nome social|orientacao sexual|sexual orientation|religiao|religion|idade|age|data de nascimento|date of birth|estado civil|marital)\b/;
/** Documentos de identificação: nunca preenchidos pelo JARVIS. */
const DOCUMENT = /\b(cpf|rg|cnh|passaporte|passport|ssn|social security|titulo de eleitor|pis|nis|ctps|documento de identidade|national id)\b/;
const CONSENT = /(concordo|aceito|agree|consent|privacidade|privacy|termos|terms|autorizo|authorize|declaro|certify)/;
const SALARY = /(pretensao salarial|expectativa salarial|salario|salary|remuneracao|compensation)/;
/** Pergunta sobre outra pessoa ("e-mail de quem te indicou"): os dados do candidato não servem. */
const OTHER_PERSON = /(indicacao|indicou|indicad|referr|referenc|reference|da pessoa|colaborador|gestor|manager|recrutador|recruiter|emergencia|emergency|responsavel|parente|relative)/;
/** Nomes de outras coisas ("Nome da empresa", "Nome da escola"). */
// Palavras inteiras: "pai" sem delimitador casaria com "país".
const NOT_THE_CANDIDATE = /\b(empresa|company|employer|escola|school|faculdade|universidade|university|instituicao|institution|curso|course|mae|pai|mother|father)\b/;

const AUTOCOMPLETE_SOURCE: Record<string, string> = {
  email: 'perfil.email',
  'given-name': 'perfil.nome',
  'family-name': 'perfil.sobrenome',
  name: 'perfil.nome completo',
  tel: 'perfil.telefone',
  'tel-national': 'perfil.telefone',
  'address-level2': 'perfil.cidade',
};

/**
 * Campo de cadastro do próprio candidato? Rótulo longo é pergunta, não cadastro
 * ("Caso seja indicação, informe o e-mail corporativo da pessoa que te indicou").
 */
function identitySource(l: string, autocomplete: string | null | undefined): string | null {
  const byHint = autocomplete ? AUTOCOMPLETE_SOURCE[autocomplete] : undefined;
  if (byHint) return byHint;
  if (l.length > 40 || NOT_THE_CANDIDATE.test(l)) return null;
  if (/e-?mail/.test(l)) return 'perfil.email';
  if (/(sobrenome|last name|family name|surname)/.test(l)) return 'perfil.sobrenome';
  if (/(nome completo|full name|^nome e sobrenome|^name$)/.test(l)) return 'perfil.nome completo';
  if (/^(primeiro )?nome$|^(first|given) name$/.test(l)) return 'perfil.nome';
  if (/(telefone|celular|phone|mobile|whats)/.test(l)) return 'perfil.telefone';
  if (/(cidade|city)/.test(l)) return 'perfil.cidade';
  if (/(localiza|location|onde voce mora|where do you live)/.test(l)) return 'perfil.cidade/estado';
  if (/^(pais|country)$/.test(l)) return 'perfil.pais';
  return null;
}

/**
 * Decide, campo a campo, o que pode ser preenchido com dados verificados do perfil.
 * Nunca inventa respostas: o que não vem do perfil vai para o candidato.
 */
export function mapFields(fields: FormField[], profile: AutomationProfile | undefined, hasResume: boolean): FieldMapping[] {
  return fields.map((f) => {
    const l = norm(f.label).replace(/[\s:?*]+$/, '');
    const base = { key: f.key, label: f.label || '(sem rótulo)', type: f.type, required: f.required, ...(f.options ? { options: f.options } : {}) };
    // Obrigatório → a pessoa responde; opcional → fica em branco.
    const human = (reason: string): FieldMapping => ({ ...base, status: f.required ? 'NEEDS_HUMAN' : 'SKIPPED', source: null, reason });

    if (SENSITIVE.test(l)) return human('Dado sensível ou de autodeclaração: o JARVIS nunca preenche; só você decide se responde.');
    if (DOCUMENT.test(l)) return human('Documento pessoal: o JARVIS não preenche documentos de identificação.');
    if (f.type === 'password') return { ...base, status: 'NEEDS_HUMAN', source: null, reason: 'Senha: o JARVIS não digita senhas.' };
    if ((f.type === 'checkbox' || f.type === 'checkbox-group') && CONSENT.test(l)) {
      return { ...base, status: 'NEEDS_HUMAN', source: null, reason: 'Consentimento ou declaração legal: só você pode aceitar.' };
    }
    if (f.type === 'file') {
      if (/(curricul|resume|\bcv\b)/.test(l)) {
        if (hasResume) return { ...base, status: 'AUTO', source: 'currículo principal', reason: 'Anexa o seu currículo principal.' };
        return human('Você ainda não tem currículo principal no JARVIS.');
      }
      return human('Anexo diferente do currículo (ex.: carta): precisa de você.');
    }
    if (SALARY.test(l)) return human('Pretensão salarial: só você define o valor que declara.');

    if (OTHER_PERSON.test(l) && /(e-?mail|nome|name|telefone|phone|contato|contact)/.test(l)) {
      return human('Pergunta sobre outra pessoa (ex.: quem te indicou): o JARVIS não usa os seus dados aqui.');
    }
    const source = identitySource(l, f.autocomplete);
    if (source) {
      if (profile && valueFor(source, profile)) {
        const reason =
          f.type === 'combobox'
            ? 'Dado verificado do seu perfil; na hora de preencher, é preciso escolher a sugestão certa na lista.'
            : 'Preenchível com dado verificado do seu perfil.';
        return { ...base, status: 'AUTO', source, reason };
      }
      return human(`Campo de ${source}, mas o dado não está no seu perfil.`);
    }
    if (/(linkedin|github|portfolio|website|site pessoal)/.test(l)) return human('Link pessoal ainda não existe no perfil.');
    if (f.type === 'checkbox-group' || f.type === 'radio-group' || f.type === 'select' || f.type === 'combobox') {
      return human('Pergunta de escolha da vaga: você escolhe a opção (o JARVIS não inventa).');
    }
    return f.required
      ? { ...base, status: 'NEEDS_HUMAN', source: null, reason: 'Pergunta específica da vaga: precisa da sua resposta (o JARVIS não inventa).' }
      : { ...base, status: 'SKIPPED', source: null, reason: 'Opcional e sem dado verificado no perfil.' };
  });
}

export function valueFor(source: string, p: AutomationProfile): string | null {
  switch (source) {
    case 'perfil.email':
      return p.email;
    case 'perfil.sobrenome':
      return p.lastName;
    case 'perfil.nome completo':
      return p.fullName;
    case 'perfil.nome':
      return p.firstName;
    case 'perfil.telefone':
      return p.phone;
    case 'perfil.cidade':
      return p.city;
    case 'perfil.cidade/estado':
      return [p.city, p.state].filter(Boolean).join(', ');
    default:
      return null;
  }
}
