import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface NetworkPolicyConfig {
  /** Hosts em que a página principal pode navegar (o host e seus subdomínios). */
  navigationAllowlist: string[];
  /** host:porta de loopback liberados — apenas o site de testes controlado. */
  allowLoopback: Set<string>;
  /** Resolução de DNS injetável (testes). */
  resolve?: (host: string) => Promise<string[]>;
}

const V4_BLOCKED: Array<[number, number, number, number, number]> = [
  [0, 0, 0, 0, 8], // "esta" rede
  [10, 0, 0, 0, 8], // privada
  [100, 64, 0, 0, 10], // CGNAT
  [127, 0, 0, 0, 8], // loopback
  [169, 254, 0, 0, 16], // link-local (inclui metadados de nuvem 169.254.169.254)
  [172, 16, 0, 0, 12], // privada
  [192, 0, 0, 0, 24], // reservada
  [192, 168, 0, 0, 16], // privada
  [198, 18, 0, 0, 15], // testes de rede
  [224, 0, 0, 0, 4], // multicast
  [240, 0, 0, 0, 4], // reservada
];

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

export function isPrivateIp(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(ip) === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKED.some(([a, b, c, d, bits]) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(`${a}.${b}.${c}.${d}`) & mask);
    });
  }
  if (isIP(ip) === 6) {
    if (ip === '::' || ip === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^(fc|fd)/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip);
  }
  return false;
}

export function matchesAllowlist(host: string, allowlist: string[]): boolean {
  const h = host.toLowerCase();
  return allowlist.some((a) => {
    const entry = a.toLowerCase();
    return h === entry || h.endsWith(`.${entry}`);
  });
}

const defaultResolve = async (host: string) => (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);

/**
 * Política de rede do JARVIS WEB. Toda requisição do navegador passa por aqui.
 * - Navegação da página principal: só HTTPS e só hosts da allowlist.
 * - Qualquer requisição: nunca para loopback, rede privada, link-local ou metadados de nuvem,
 *   inclusive quando um domínio público resolve para um IP privado.
 * - Protocolos fora de http(s) são barrados (data:/blob: só como sub-recurso).
 */
export class NetworkGuard {
  readonly blocked: string[] = [];
  private readonly cache = new Map<string, Promise<boolean>>();
  private readonly policy: NetworkPolicyConfig;

  constructor(policy: NetworkPolicyConfig) {
    this.policy = policy;
  }

  /** null = permitido; string = motivo do bloqueio. */
  async check(rawUrl: string, isMainNavigation: boolean): Promise<string | null> {
    const reason = await this.evaluate(rawUrl, isMainNavigation);
    if (reason && this.blocked.length < 20) this.blocked.push(`${reason} — ${rawUrl.slice(0, 160)}`);
    return reason;
  }

  private async evaluate(rawUrl: string, isMainNavigation: boolean): Promise<string | null> {
    if (rawUrl === 'about:blank') return null;
    let u: URL;
    try {
      u = new URL(rawUrl);
    } catch {
      return 'URL inválida';
    }
    if (u.protocol === 'data:' || u.protocol === 'blob:') return isMainNavigation ? `Protocolo não permitido na navegação: ${u.protocol}` : null;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return `Protocolo bloqueado: ${u.protocol}`;

    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    // Site de testes controlado: liberado por host:porta exatos, nunca por faixa.
    if (this.policy.allowLoopback.has(u.host.toLowerCase())) return null;

    if (isMainNavigation) {
      if (u.protocol !== 'https:') return 'Navegação sem HTTPS bloqueada';
      if (!matchesAllowlist(host, this.policy.navigationAllowlist)) return `Fora da allowlist de navegação: ${host}`;
    }
    if (host === 'localhost' || /\.(localhost|local|internal|intranet|lan)$/.test(host)) return `Host local bloqueado: ${host}`;
    if (isIP(host)) return isPrivateIp(host) ? `IP privado bloqueado: ${host}` : null;
    return (await this.resolvesPublic(host)) ? null : `Host resolve para rede privada: ${host}`;
  }

  private resolvesPublic(host: string): Promise<boolean> {
    let p = this.cache.get(host);
    if (!p) {
      const resolve = this.policy.resolve ?? defaultResolve;
      p = resolve(host)
        .then((ips) => ips.length > 0 && ips.every((ip) => !isPrivateIp(ip)))
        .catch(() => false);
      this.cache.set(host, p);
    }
    return p;
  }
}
