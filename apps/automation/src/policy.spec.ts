import { describe, expect, it } from 'vitest';
import { isPrivateIp, matchesAllowlist, NetworkGuard } from './policy.ts';

const dns: Record<string, string[]> = {
  'job-boards.greenhouse.io': ['104.18.1.1'],
  'cdn.example.com': ['93.184.216.34'],
  'rebind.attacker.example': ['10.0.0.5'],
};
const guard = () =>
  new NetworkGuard({
    navigationAllowlist: ['greenhouse.io'],
    allowLoopback: new Set(['127.0.0.1:4100']),
    resolve: async (h) => dns[h] ?? [],
  });

describe('isPrivateIp', () => {
  it('reconhece faixas privadas, loopback, link-local e mapeadas', () => {
    for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.20.0.1', '192.168.0.10', '100.64.1.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '104.18.1.1', '172.32.0.1', '2606:4700::1111']) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
});

describe('regressões de expressões', () => {
  it('"cidade" e "privacidade" não são confundidas com "idade"', async () => {
    const { mapFields } = await import('./inspect.ts');
    const m = mapFields(
      [
        { key: 'a', label: 'Cidade', type: 'text', required: false },
        { key: 'b', label: 'Li e aceito a política de privacidade', type: 'checkbox', required: true },
        { key: 'c', label: 'Idade', type: 'text', required: true },
      ],
      { fullName: 'A B', firstName: 'A', lastName: 'B', email: 'a@b.c', phone: null, city: 'Curitiba', state: 'PR' },
      false,
    );
    // Idade obrigatória: sensível, o JARVIS não preenche; a pessoa decide.
    expect(m.map((x) => x.status)).toEqual(['AUTO', 'NEEDS_HUMAN', 'NEEDS_HUMAN']);
    expect(m[2].reason).toContain('sensível');
  });
});

describe('matchesAllowlist', () => {
  it('aceita o host e subdomínios, não sufixos parecidos', () => {
    expect(matchesAllowlist('job-boards.greenhouse.io', ['greenhouse.io'])).toBe(true);
    expect(matchesAllowlist('greenhouse.io', ['greenhouse.io'])).toBe(true);
    expect(matchesAllowlist('evilgreenhouse.io', ['greenhouse.io'])).toBe(false);
    expect(matchesAllowlist('greenhouse.io.evil.example', ['greenhouse.io'])).toBe(false);
  });
});

describe('NetworkGuard', () => {
  it('navegação principal: só HTTPS e só na allowlist', async () => {
    const g = guard();
    expect(await g.check('https://job-boards.greenhouse.io/acme/jobs/1', true)).toBeNull();
    expect(await g.check('http://job-boards.greenhouse.io/acme', true)).toContain('HTTPS');
    expect(await g.check('https://cdn.example.com/', true)).toContain('allowlist');
  });

  it('sub-recursos públicos fora da allowlist são permitidos (CDNs)', async () => {
    expect(await guard().check('https://cdn.example.com/app.js', false)).toBeNull();
  });

  it('bloqueia SSRF: IP privado, metadados de nuvem, localhost e DNS que resolve para rede interna', async () => {
    const g = guard();
    expect(await g.check('http://169.254.169.254/latest/meta-data', false)).toContain('IP privado');
    expect(await g.check('http://localhost:5433/', false)).toContain('local');
    expect(await g.check('http://10.0.0.8/admin', false)).toContain('IP privado');
    expect(await g.check('https://rebind.attacker.example/x', false)).toContain('rede privada');
    expect(await g.check('http://127.0.0.1:4000/api/health', false)).toContain('IP privado');
    expect(g.blocked.length).toBe(5);
  });

  it('libera só o host:porta exato do site de testes', async () => {
    const g = guard();
    expect(await g.check('http://127.0.0.1:4100/vagas/42/aplicar', true)).toBeNull();
    expect(await g.check('http://127.0.0.1:4101/', true)).not.toBeNull();
  });

  it('bloqueia protocolos perigosos na navegação', async () => {
    const g = guard();
    expect(await g.check('file:///C:/Windows/win.ini', true)).toContain('Protocolo');
    expect(await g.check('javascript:alert(1)', true)).toContain('Protocolo');
    expect(await g.check('data:text/html,<h1>x</h1>', true)).toContain('Protocolo');
    expect(await g.check('data:image/png;base64,AAAA', false)).toBeNull();
  });
});
