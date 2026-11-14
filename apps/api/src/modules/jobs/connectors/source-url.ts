import type { BoardRef } from './types.js';

export interface ParsedJobUrl extends BoardRef {
  /** Presente quando o link aponta para uma vaga específica. */
  externalId: string | null;
}

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const valid = (t: string | undefined): t is string => !!t && TOKEN.test(t);

/**
 * Reconhece links públicos de páginas de vagas e de vagas individuais.
 * Aceita também a forma curta "greenhouse:token", "lever:site" ou "ashby:nome".
 * Qualquer outra coisa devolve null (nunca é buscada).
 */
export function parseJobUrl(input: string): ParsedJobUrl | null {
  const raw = input.trim();
  const short = /^(greenhouse|lever|ashby):([A-Za-z0-9_.-]+)$/i.exec(raw);
  if (short && valid(short[2])) {
    return { provider: short[1].toUpperCase() as BoardRef['provider'], boardToken: short[2], region: null, externalId: null };
  }

  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);

  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io' || host === 'job-boards.eu.greenhouse.io') {
    // /embed/job_board?for=token  ou  /token  ou  /token/jobs/123
    const token = parts[0] === 'embed' ? (u.searchParams.get('for') ?? undefined) : parts[0];
    if (!valid(token)) return null;
    const jobId = parts[1] === 'jobs' && /^\d+$/.test(parts[2] ?? '') ? parts[2] : (u.searchParams.get('gh_jid') ?? null);
    return { provider: 'GREENHOUSE', boardToken: token, region: null, externalId: jobId && /^\d+$/.test(jobId) ? jobId : null };
  }

  if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') {
    const site = parts[0];
    if (!valid(site)) return null;
    const id = parts[1] && /^[0-9a-f-]{36}$/i.test(parts[1]) ? parts[1] : null;
    return { provider: 'LEVER', boardToken: site, region: host === 'jobs.eu.lever.co' ? 'eu' : null, externalId: id };
  }

  if (host === 'jobs.ashbyhq.com') {
    const name = parts[0];
    if (!valid(name)) return null;
    const id = parts[1] && /^[0-9a-f-]{36}$/i.test(parts[1]) ? parts[1] : null;
    return { provider: 'ASHBY', boardToken: name, region: null, externalId: id };
  }

  return null;
}
