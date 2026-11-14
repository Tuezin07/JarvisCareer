import Browserbase from '@browserbasehq/sdk';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import type { AutomationConfig } from './config.ts';
import type { NetworkGuard } from './policy.ts';

export interface BrowserSession {
  provider: 'local' | 'browserbase';
  page: Page;
  context: BrowserContext;
  close(): Promise<void>;
}

/**
 * Abre um navegador com contexto descartável e a política de rede aplicada a toda
 * requisição (inclusive redirecionamentos, iframes, popups e WebSockets).
 * Sem perfil persistente, sem downloads, sem service workers, sem técnicas "stealth".
 */
export async function openSession(cfg: Pick<AutomationConfig, 'provider' | 'headless' | 'browserbaseApiKey' | 'browserbaseProjectId'>, guard: NetworkGuard): Promise<BrowserSession> {
  let browser: Browser;
  let context: BrowserContext;

  if (cfg.provider === 'browserbase') {
    const bb = new Browserbase({ apiKey: cfg.browserbaseApiKey! });
    const remote = await bb.sessions.create(cfg.browserbaseProjectId ? { projectId: cfg.browserbaseProjectId } : {});
    browser = await chromium.connectOverCDP(remote.connectUrl);
    // Cada sessão Browserbase é um navegador novo: o contexto padrão já é isolado.
    context = browser.contexts()[0] ?? (await browser.newContext());
  } else {
    browser = await chromium.launch({ headless: cfg.headless });
    context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: 'block',
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      viewport: { width: 1280, height: 900 },
    });
  }

  const page = await context.newPage();

  await context.route('**/*', async (route) => {
    const req = route.request();
    let isMainNavigation = false;
    try {
      isMainNavigation = req.isNavigationRequest() && req.frame().parentFrame() === null;
    } catch {
      // requisições sem frame (ex.: service worker, que está bloqueado) seguem como sub-recurso
    }
    const reason = await guard.check(req.url(), isMainNavigation);
    if (reason) return route.abort('blockedbyclient');
    // O interceptador do Playwright não vê os saltos de um redirecionamento: buscamos sem
    // seguir, validamos o destino e entregamos a resposta — o próximo salto passa por aqui de novo.
    const response = await route.fetch({ maxRedirects: 0 }).catch(() => null);
    if (!response) return route.abort('failed');
    if (response.status() >= 300 && response.status() < 400) {
      const location = response.headers()['location'];
      if (location && (await guard.check(new URL(location, req.url()).toString(), isMainNavigation))) {
        return route.abort('blockedbyclient');
      }
    }
    return route.fulfill({ response });
  });
  await context.routeWebSocket(/.*/, async (ws) => {
    const reason = await guard.check(ws.url().replace(/^ws/, 'http'), false);
    if (reason) await ws.close({ code: 1008, reason: 'Bloqueado pela política do JARVIS' });
    else ws.connectToServer();
  });

  return {
    provider: cfg.provider,
    page,
    context,
    async close() {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
}
