import type { WorkplaceType } from '@jarvis/shared';
import { normalize } from './text.js';

/** Modalidade inferida de texto curto (local/título). Sem evidência, UNKNOWN — nunca um palpite. */
export function workplaceFromText(text: string): WorkplaceType {
  const t = normalize(text);
  if (/\b(hibrid[oa]|hybrid)\b/.test(t)) return 'HYBRID';
  if (/\b(remot[oa]|remote|home ?office|anywhere|teletrabalho)\b/.test(t)) return 'REMOTE';
  if (/\b(presencial|on-?site|in-?office)\b/.test(t)) return 'ONSITE';
  return 'UNKNOWN';
}

export function workplaceFromProvider(value: string | null | undefined): WorkplaceType {
  const v = normalize(value ?? '').replace(/[^a-z]/g, '');
  if (v === 'remote') return 'REMOTE';
  if (v === 'hybrid') return 'HYBRID';
  if (v === 'onsite') return 'ONSITE';
  return 'UNKNOWN';
}
