"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AGENT_STATE_LABEL, type DashboardSummary } from "@jarvis/shared";
import { JarvisCore } from "@/components/JarvisCore";
import { EventItem, Gauge, Panel, PhaseBadge, Stat, useNow } from "@/components/hud";
import { useAgent, useAgentEvent } from "@/lib/agent-context";
import { api, timeAgo } from "@/lib/api";
import { useSession } from "@/lib/session-context";

/** Estado real de cada módulo — atualizado a cada fase entregue. */
const MODULES: Array<{ name: string; status: "ok" | "planned"; phase?: number }> = [
  { name: "Conta, sessão e LGPD", status: "ok" },
  { name: "Perfil e preferências", status: "ok" },
  { name: "Leitura de currículos", status: "ok" },
  { name: "Linha do tempo ao vivo", status: "ok" },
  { name: "Conversa e análise por IA", status: "planned", phase: 2 },
  { name: "Pesquisa de vagas", status: "planned", phase: 3 },
  { name: "JARVIS WEB (navegador)", status: "planned", phase: 4 },
  { name: "Candidaturas", status: "planned", phase: 5 },
  { name: "JARVIS DESKTOP", status: "planned", phase: 6 },
  { name: "Voz", status: "planned", phase: 7 },
];

export default function CommandCenter() {
  const { me } = useSession();
  const { snapshot, events, pulse } = useAgent();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const now = useNow();

  const load = useCallback(() => {
    api<DashboardSummary>("/dashboard/summary").then(setSummary).catch(() => undefined);
  }, []);
  useEffect(load, [load]);
  useAgentEvent("", load);

  const state = snapshot?.state ?? "idle";
  const firstName = me.fullName.split(" ")[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr] 2xl:grid-cols-[320px_1fr_380px]">
      <div className="order-2 flex flex-col gap-5 lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-1 2xl:row-span-1">
        <Panel title="Perfil profissional" code="PRF-01">
          {summary ? (
            <>
              <Gauge value={summary.profileCompleteness.percent} label="Completude do perfil" />
              {summary.profileCompleteness.missing.length > 0 && (
                <ul className="mt-4 space-y-1.5 text-sm text-ink-dim">
                  {summary.profileCompleteness.missing.slice(0, 4).map((m) => (
                    <li key={m} className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-amber" /> {m}
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/perfil" className="hud-btn hud-btn-ghost mt-4 w-full">
                Completar perfil
              </Link>
            </>
          ) : (
            <p className="text-sm text-ink-faint">Carregando telemetria…</p>
          )}
        </Panel>

        <Panel title="Currículos" code="CVS-01">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Enviados" value={summary?.resumes.total ?? "—"} />
            <Stat label="Lidos" value={summary?.resumes.extracted ?? "—"} />
            <Stat label="Em leitura" value={summary?.resumes.processing ?? "—"} />
            <Stat label="Com falha" value={summary?.resumes.failed ?? "—"} />
          </div>
          <Link href="/curriculos" className="hud-btn hud-btn-ghost mt-4 w-full">
            Gerenciar currículos
          </Link>
        </Panel>

        <Panel title="Operações" code="OPS-24">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Eventos 24h" value={summary?.events24h ?? "—"} />
            <Stat label="Vagas" value={<PhaseBadge phase={3} />} hint="ainda não pesquisa" />
            <Stat label="Candidaturas" value={<PhaseBadge phase={5} />} hint="ainda não envia" />
          </div>
        </Panel>
      </div>

      <div className="order-1 flex flex-col items-center gap-4 lg:order-none lg:col-start-2 lg:row-start-1">
        <p className="hud-label">Bem-vindo, {firstName}</p>
        <div className="w-full max-w-[min(520px,82vw)]">
          <JarvisCore state={state} pulse={pulse} label={snapshot?.label ?? undefined} />
        </div>
        <div className="text-center" aria-live="polite">
          <p className="hud-title text-2xl font-semibold uppercase tracking-[0.2em] text-ink">{AGENT_STATE_LABEL[state]}</p>
          {snapshot && (
            <p className="mt-1 text-sm text-ink-dim">
              {snapshot.label} · <span className="font-mono text-xs text-ink-faint">{timeAgo(snapshot.updatedAt, now)}</span>
            </p>
          )}
        </div>

        <Panel title="Estado dos módulos" code="SYS-MAP" className="w-full max-w-2xl">
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {MODULES.map((m) => (
              <li key={m.name} className="flex items-center justify-between gap-3 text-sm">
                <span className={m.status === "ok" ? "text-ink" : "text-ink-faint"}>{m.name}</span>
                {m.status === "ok" ? (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-green">Ativo</span>
                ) : (
                  <PhaseBadge phase={m.phase!} />
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-faint">
            O JARVIS só mostra o que de fato executou. Módulos marcados com a fase ainda não existem e não são simulados.
          </p>
        </Panel>
      </div>

      <div className="order-3 lg:order-none lg:col-start-2 lg:row-start-2 2xl:col-start-3 2xl:row-start-1">
        <Panel
          title="Atividade ao vivo"
          code="LOG-RT"
          className="2xl:sticky 2xl:top-20"
          action={
            <Link href="/atividade" className="text-xs text-cyan hover:underline">
              Ver tudo
            </Link>
          }
        >
          {events.length === 0 ? (
            <p className="text-sm text-ink-faint">Nenhuma operação registrada ainda. Envie um currículo para começar.</p>
          ) : (
            <ol className="ml-1 max-h-[70vh] overflow-y-auto pr-1">
              {events.slice(0, 14).map((e) => (
                <EventItem key={e.id} event={e} now={now} />
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
