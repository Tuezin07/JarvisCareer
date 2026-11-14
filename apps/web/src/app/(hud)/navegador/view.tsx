"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BROWSER_STATUS_LABEL,
  type BrowserCapabilitiesDto,
  type BrowserSessionDto,
  type BrowserSessionStatus,
  type FieldMapping,
} from "@jarvis/shared";
import { ErrorNote, Panel, useNow } from "@/components/hud";
import { useAgentEvent } from "@/lib/agent-context";
import { API_URL, ApiError, api, timeAgo } from "@/lib/api";

const STATUS_COLOR: Record<BrowserSessionStatus, string> = {
  QUEUED: "var(--text-dim)",
  RUNNING: "var(--cyan)",
  SUCCEEDED: "var(--green)",
  FAILED: "var(--red)",
  WAITING_HUMAN: "var(--amber)",
  CANCELLED: "var(--text-faint)",
  BLOCKED: "var(--amber)",
};

const MAPPING_LABEL: Record<FieldMapping["status"], { text: string; color: string }> = {
  AUTO: { text: "Do perfil", color: "var(--green)" },
  NEEDS_HUMAN: { text: "Precisa de você", color: "var(--amber)" },
  SKIPPED: { text: "Não preenche", color: "var(--text-faint)" },
};

const ACTIVE: BrowserSessionStatus[] = ["QUEUED", "RUNNING"];

export default function BrowserView() {
  const [caps, setCaps] = useState<BrowserCapabilitiesDto | null>(null);
  const [sessions, setSessions] = useState<BrowserSessionDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(5_000);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([api<BrowserCapabilitiesDto>("/browser/capabilities"), api<BrowserSessionDto[]>("/browser/sessions")]);
    setCaps(c);
    setSessions(s);
    return s;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fromLink = new URLSearchParams(window.location.search).get("session");
    Promise.all([api<BrowserCapabilitiesDto>("/browser/capabilities"), api<BrowserSessionDto[]>("/browser/sessions")])
      .then(([c, s]) => {
        if (cancelled) return;
        setCaps(c);
        setSessions(s);
        setSelectedId((cur) => cur ?? fromLink ?? s[0]?.id ?? null);
      })
      .catch(() => !cancelled && setError("Falha ao carregar as sessões."));
    return () => {
      cancelled = true;
    };
  }, []);

  // Eventos browser.* chegam ao concluir; enquanto algo roda, atualiza a cada 2 s.
  useAgentEvent("browser.", () => void load());
  const running = sessions.some((s) => ACTIVE.includes(s.status));
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => void load(), 2_000);
    return () => clearInterval(id);
  }, [running, load]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Operação falhou.");
    }
  }

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(300px,380px)_1fr]">
      <div className="flex flex-col gap-5">
        <Panel title="JARVIS WEB" code="WEB-01">
          <p className="text-sm text-ink-dim">
            Navegador isolado, separado da API. Só abre páginas oficiais de candidatura, barra endereços internos e nunca contorna CAPTCHA
            ou login. Nesta fase ele <strong className="text-ink">não envia</strong> candidaturas.
          </p>
          {caps && (
            <ul className="mt-3 space-y-1.5 text-sm">
              <li className="text-ink-dim">
                Sessões nas últimas 24 h: <span className="font-mono text-ink">{caps.usedToday}</span> de {caps.dailyLimit}
              </li>
              <li className={caps.screenshotsConsent ? "text-green" : "text-amber"}>
                {caps.screenshotsConsent ? (
                  "Capturas de tela de evidência: autorizadas"
                ) : (
                  <>
                    Capturas de tela desligadas.{" "}
                    <Link href="/privacidade" className="underline">
                      Autorizar em Privacidade
                    </Link>
                  </>
                )}
              </li>
            </ul>
          )}
          {caps?.testSiteUrl && (
            <button
              className="hud-btn hud-btn-ghost mt-4 w-full"
              disabled={running}
              onClick={() =>
                act(async () => {
                  const s = await api<BrowserSessionDto>("/browser/test-form", { method: "POST" });
                  setSelectedId(s.id);
                  await load();
                })
              }
            >
              Testar preenchimento no formulário de testes
            </button>
          )}
          <p className="mt-2 text-xs text-ink-faint">
            Para inspecionar uma vaga real, abra a vaga em{" "}
            <Link href="/vagas" className="underline">
              Vagas
            </Link>{" "}
            e use “Inspecionar formulário”.
          </p>
          <ErrorNote message={error} />
        </Panel>

        <Panel title="Sessões" code="WEB-LOG">
          {sessions.length === 0 ? (
            <p className="text-sm text-ink-faint">Nenhuma sessão ainda.</p>
          ) : (
            <ul className="divide-y divide-line">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full py-2.5 text-left transition-colors hover:bg-cyan/5 ${s.id === selectedId ? "bg-cyan/10" : ""}`}
                  >
                    <span className="block truncate text-sm text-ink">{s.title ?? s.targetUrl}</span>
                    <span className="flex items-center gap-2 font-mono text-[11px]">
                      <span style={{ color: STATUS_COLOR[s.status] }} className={ACTIVE.includes(s.status) ? "animate-pulse" : ""}>
                        {BROWSER_STATUS_LABEL[s.status]}
                      </span>
                      <span className="text-ink-faint">
                        {s.kind === "INSPECT_PAGE" ? "inspeção" : "teste"} · {timeAgo(s.createdAt, now)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Detalhe da sessão" code="WEB-DTL">
        {!selected ? (
          <p className="text-sm text-ink-faint">Selecione uma sessão.</p>
        ) : (
          <SessionDetail
            session={selected}
            onCancel={() =>
              act(async () => {
                await api(`/browser/sessions/${selected.id}/cancel`, { method: "POST" });
                await load();
              })
            }
          />
        )}
      </Panel>
    </div>
  );
}

function SessionDetail({ session: s, onCancel }: { session: BrowserSessionDto; onCancel: () => void }) {
  const human = s.mapping.filter((m) => m.required && m.status === "NEEDS_HUMAN");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="hud-title truncate text-lg font-semibold text-ink">{s.title ?? "Sessão de navegador"}</h2>
          <p className="mt-1 break-all font-mono text-[11px] text-ink-faint">{s.finalUrl ?? s.targetUrl}</p>
          <p className="mt-1 text-sm" style={{ color: STATUS_COLOR[s.status] }}>
            {BROWSER_STATUS_LABEL[s.status]}
            {s.provider ? <span className="text-ink-faint"> · navegador {s.provider} · Playwright</span> : null}
          </p>
        </div>
        {ACTIVE.includes(s.status) && (
          <button className="hud-btn hud-btn-danger" onClick={onCancel}>
            Parar agora
          </button>
        )}
      </div>

      {s.error && <p className="rounded border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">{s.error}</p>}

      {s.blockers.length > 0 && (
        <section className="rounded border border-amber/40 bg-amber/10 p-3 text-sm">
          <p className="font-medium text-amber">Exige uma pessoa</p>
          <ul className="mt-1 space-y-1 text-ink-dim">
            {s.blockers.map((b, i) => (
              <li key={i}>{b.detail}</li>
            ))}
          </ul>
        </section>
      )}

      {s.mapping.length > 0 && (
        <section>
          <h3 className="hud-label mb-2">
            Formulário · {s.mapping.filter((m) => m.status === "AUTO").length} do perfil · {human.length} obrigatório(s) com você
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-faint">
                <tr>
                  <th className="py-1.5 pr-3 font-normal">Campo</th>
                  <th className="py-1.5 pr-3 font-normal">Situação</th>
                  <th className="py-1.5 font-normal">Por quê</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {s.mapping.map((m) => (
                  <tr key={m.key}>
                    <td className="py-1.5 pr-3 align-top text-ink">
                      {m.label}
                      {m.required && <span className="text-amber"> *</span>}
                      <span className="block font-mono text-[10px] text-ink-faint">{m.type}</span>
                      {m.options && m.options.length > 0 && (
                        <span className="block text-[11px] text-ink-dim">
                          Opções: {m.options.slice(0, 6).join(" · ")}
                          {m.options.length > 6 ? ` · +${m.options.length - 6}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 align-top font-mono text-[11px]" style={{ color: MAPPING_LABEL[m.status].color }}>
                      {MAPPING_LABEL[m.status].text}
                    </td>
                    <td className="py-1.5 align-top text-xs text-ink-dim">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {s.evidence.length > 0 && (
        <section>
          <h3 className="hud-label mb-2">Evidências</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {s.evidence.map((e) => (
              <figure key={e.id} className="overflow-hidden rounded border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- imagem privada servida pela API com cookie de sessão */}
                <img src={`${API_URL}${e.url}`} alt={e.label} className="w-full" loading="lazy" />
                <figcaption className="px-2 py-1 text-xs text-ink-dim">
                  {e.label} · expira em {new Date(e.expiresAt).toLocaleDateString("pt-BR")}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
      {!s.screenshotsConsent && s.evidence.length === 0 && (
        <p className="text-xs text-ink-faint">
          Sem capturas de tela: você não autorizou em Privacidade. Os passos abaixo continuam registrados.
        </p>
      )}

      {s.steps.length > 0 && (
        <section>
          <h3 className="hud-label mb-2">Passos executados</h3>
          <ol className="space-y-1.5">
            {s.steps.map((p) => (
              <li key={p.index} className="flex gap-3 text-sm">
                <span
                  className="font-mono text-[11px]"
                  style={{ color: p.status === "OK" ? "var(--green)" : p.status === "FAILED" ? "var(--red)" : "var(--amber)" }}
                >
                  {p.status}
                </span>
                <span className="min-w-0">
                  <span className="text-ink">{p.action}</span>
                  {p.target && <span className="text-ink-faint"> · {p.target.slice(0, 80)}</span>}
                  <span className="block text-xs text-ink-dim">
                    {p.detail} · {p.durationMs} ms
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {s.blockedRequests.length > 0 && (
        <section>
          <h3 className="hud-label mb-2">Requisições barradas pela política ({s.blockedRequests.length})</h3>
          <ul className="space-y-1 font-mono text-[11px] text-ink-dim">
            {s.blockedRequests.map((b, i) => (
              <li key={i} className="break-all">
                {b}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
