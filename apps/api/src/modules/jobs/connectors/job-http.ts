import { Injectable } from '@nestjs/common';

export const JOB_HTTP = Symbol('JOB_HTTP');

export interface JobHttp {
  /** GET de JSON. 404 devolve `null`; outros erros lançam. */
  getJson<T>(url: string): Promise<T | null>;
}

/** Só estes hosts podem ser chamados pelos conectores (proteção contra SSRF). */
export const ALLOWED_HOSTS = new Set(['boards-api.greenhouse.io', 'api.lever.co', 'api.eu.lever.co', 'api.ashbyhq.com']);

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 25 * 1024 * 1024;
const USER_AGENT = 'JARVIS-Career/0.1 (assistente de recolocacao; leitura de vagas publicas)';

export class JobHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class FetchJobHttp implements JobHttp {
  async getJson<T>(url: string): Promise<T | null> {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) {
      throw new Error(`Host não permitido para conectores: ${u.hostname}`);
    }
    const res = await fetch(u, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new JobHttpError(res.status, `HTTP ${res.status} em ${u.hostname}`);
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) throw new Error('Resposta grande demais');
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('Resposta grande demais');
    return JSON.parse(text) as T;
  }
}
