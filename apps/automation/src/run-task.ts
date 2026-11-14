import type { AutomationResult, AutomationTask, Blocker, BrowserStep, FieldMapping, FormField } from '@jarvis/shared';
import type { Page } from 'playwright';
import { type BrowserSession, openSession } from './browser.ts';
import type { AutomationConfig } from './config.ts';
import { detectBlockers, extractFields, KEY_ATTR, mapFields, valueFor } from './inspect.ts';
import { NetworkGuard } from './policy.ts';

export interface RunDeps {
  cfg: Pick<AutomationConfig, 'provider' | 'headless' | 'allowLoopback' | 'browserbaseApiKey' | 'browserbaseProjectId'>;
  /** Verificado entre passos: o candidato pode parar a qualquer momento. */
  isCancelled: () => Promise<boolean>;
  resolve?: (host: string) => Promise<string[]>;
}

class Cancelled extends Error {}
class StepLimit extends Error {}

const ACTION_TIMEOUT_MS = 15_000;
/** Tipos que o executor sabe preencher e conferir (valor digitado = valor lido). */
const FILLABLE = new Set(['text', 'email', 'tel', 'url', 'search', 'textarea']);

/**
 * Executa uma tarefa de navegador do começo ao fim e devolve o resultado com evidências.
 * Nunca envia formulários nesta fase e nunca preenche nada fora do site de testes.
 */
export async function runTask(task: AutomationTask, deps: RunDeps): Promise<AutomationResult> {
  const startedAt = new Date().toISOString();
  const steps: BrowserStep[] = [];
  const screenshots: AutomationResult['screenshots'] = [];
  let fields: FormField[] = [];
  let mapping: FieldMapping[] = [];
  let blockers: Blocker[] = [];
  let finalUrl: string | null = null;
  let title: string | null = null;
  let session: BrowserSession | null = null;
  let status: AutomationResult['status'] = 'SUCCEEDED';
  let error: string | null = null;

  const guard = new NetworkGuard({ navigationAllowlist: task.navigationAllowlist, allowLoopback: deps.cfg.allowLoopback, resolve: deps.resolve });

  const step = async <T>(action: string, target: string | null, fn: () => Promise<{ detail: string; value?: T; status?: BrowserStep['status'] }>) => {
    if (steps.length >= task.limits.maxSteps) throw new StepLimit(`Limite de ${task.limits.maxSteps} passos atingido`);
    if (await deps.isCancelled()) throw new Cancelled('Cancelada pelo candidato');
    const t0 = Date.now();
    try {
      const r = await fn();
      steps.push({ index: steps.length, action, target, status: r.status ?? 'OK', detail: r.detail, durationMs: Date.now() - t0 });
      return r.value as T;
    } catch (err) {
      steps.push({ index: steps.length, action, target, status: 'FAILED', detail: (err as Error).message.slice(0, 300), durationMs: Date.now() - t0 });
      throw err;
    }
  };

  const shoot = async (page: Page, label: string) => {
    if (!task.captureScreenshots) return;
    await step('screenshot', label, async () => {
      const buf = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false, timeout: ACTION_TIMEOUT_MS });
      screenshots.push({ label, mimeType: 'image/jpeg', base64: buf.toString('base64') });
      return { detail: `Captura "${label}" (${Math.round(buf.length / 1024)} KB)` };
    });
  };

  const work = async () => {
    // Defesa em profundidade: a API já restringe, o executor confere de novo.
    const target = new URL(task.targetUrl);
    if (task.kind === 'FILL_TEST_FORM' && !deps.cfg.allowLoopback.has(target.host.toLowerCase())) {
      status = 'BLOCKED';
      error = 'Preenchimento só é permitido no site de testes controlado nesta fase.';
      return;
    }

    session = await step('open_browser', deps.cfg.provider, async () => ({ detail: `Navegador ${deps.cfg.provider} com contexto isolado`, value: await openSession(deps.cfg, guard) }));
    const page = session!.page;
    page.setDefaultTimeout(ACTION_TIMEOUT_MS);

    const navigated = await step('navigate', task.targetUrl, async () => {
      const preCheck = await guard.check(task.targetUrl, true);
      if (preCheck) return { detail: preCheck, status: 'BLOCKED' as const, value: false };
      const res = await page.goto(task.targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch((e: Error) => {
        // Redirecionamento barrado pela política aparece como erro de navegação.
        if (guard.blocked.length) return null;
        throw e;
      });
      if (!res) return { detail: guard.blocked.at(-1) ?? 'Navegação bloqueada', status: 'BLOCKED' as const, value: false };
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
      return { detail: `HTTP ${res.status()} em ${new URL(page.url()).host}`, value: res.ok() };
    });
    finalUrl = page.url() === 'about:blank' ? null : page.url();
    title = (await page.title().catch(() => '')) || null;
    if (!navigated) {
      if (steps.at(-1)?.status === 'BLOCKED') {
        status = 'BLOCKED';
        blockers.push({ kind: 'NAVIGATION_BLOCKED', detail: steps.at(-1)!.detail });
      } else {
        status = 'FAILED';
        error = 'A página não abriu corretamente.';
      }
      return;
    }

    await shoot(page, 'Página aberta');
    blockers = await step('detect_blockers', null, async () => {
      const b = await detectBlockers(page);
      return { detail: b.length ? b.map((x) => x.kind).join(', ') : 'Nenhum CAPTCHA, login ou verificação detectado', value: b };
    });
    const found = await step('extract_fields', null, async () => {
      const f = await extractFields(page);
      return { detail: `${f.length} campo(s) de formulário encontrados`, value: f };
    });
    fields = found.map(({ frameIndex: _f, ...rest }) => rest);
    mapping = await step('map_fields', null, async () => {
      const m = mapFields(fields, task.profile, !!task.resume);
      const auto = m.filter((x) => x.status === 'AUTO').length;
      const human = m.filter((x) => x.status === 'NEEDS_HUMAN').length;
      return { detail: `${auto} preenchível(is) com o perfil · ${human} precisa(m) de você`, value: m };
    });

    if (task.kind === 'INSPECT_PAGE') return;

    // FILL_TEST_FORM: preenche só campos AUTO, nunca marca consentimentos e nunca envia.
    for (const m of mapping.filter((x) => x.status === 'AUTO')) {
      const frame = page.frames()[found.find((f) => f.key === m.key)?.frameIndex ?? 0];
      const loc = frame.locator(`[${KEY_ATTR}="${m.key}"]`);
      await step('fill', m.label, async () => {
        if (m.type === 'file') {
          const r = task.resume!;
          await loc.setInputFiles({ name: r.fileName, mimeType: r.mimeType, buffer: Buffer.from(r.base64, 'base64') });
          return { detail: `Anexado: ${r.fileName}` };
        }
        // Lista de sugestões (combobox) exige escolher a opção certa: ainda não automatizado.
        if (!FILLABLE.has(m.type)) return { detail: 'Tipo de campo ainda não preenchido automaticamente', status: 'SKIPPED' as const };
        const value = valueFor(m.source ?? '', task.profile!);
        if (!value) return { detail: 'Sem valor no perfil', status: 'SKIPPED' as const };
        await loc.fill(value);
        // Confere o que ficou no campo: um clique/digitação não é sucesso por si só.
        const got = await loc.inputValue();
        if (got !== value) throw new Error('O campo não aceitou o valor');
        return { detail: `Preenchido com ${m.source}` };
      });
    }
    await shoot(page, 'Formulário preenchido (não enviado)');
    status = mapping.some((m) => m.required && m.status === 'NEEDS_HUMAN') ? 'WAITING_HUMAN' : 'SUCCEEDED';
  };

  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Tempo limite de ${task.limits.timeoutMs / 1000}s excedido`)), task.limits.timeoutMs);
      }),
    ]);
  } catch (err) {
    if (err instanceof Cancelled) status = 'CANCELLED';
    else {
      status = 'FAILED';
      error = (err as Error).message.slice(0, 500);
    }
  } finally {
    clearTimeout(timer);
    await (session as BrowserSession | null)?.close();
  }

  if (status === 'SUCCEEDED' && blockers.some((b) => b.kind !== 'NAVIGATION_BLOCKED') && task.kind === 'FILL_TEST_FORM') status = 'WAITING_HUMAN';

  return {
    version: 1,
    sessionId: task.sessionId,
    userId: task.userId,
    status,
    executor: 'playwright',
    provider: deps.cfg.provider,
    startedAt,
    finishedAt: new Date().toISOString(),
    finalUrl,
    title,
    steps,
    fields,
    mapping,
    blockers,
    blockedRequests: guard.blocked.slice(0, 20),
    screenshots: screenshots.slice(0, 5),
    error,
  };
}
