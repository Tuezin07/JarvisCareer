"use client";

import { useEffect, useState } from "react";
import type { AgentEventDto } from "@jarvis/shared";
import { EventItem, Panel, useNow } from "@/components/hud";
import { useAgent } from "@/lib/agent-context";
import { api } from "@/lib/api";

const PAGE = 40;

export default function ActivityPage() {
  const { events: live } = useAgent();
  const [older, setOlder] = useState<AgentEventDto[]>([]);
  const [initial, setInitial] = useState<AgentEventDto[] | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const now = useNow();

  useEffect(() => {
    api<AgentEventDto[]>(`/activity?limit=${PAGE}`).then((rows) => {
      setInitial(rows);
      setDone(rows.length < PAGE);
    });
  }, []);

  // Eventos ao vivo primeiro, depois a página inicial e as páginas antigas, sem duplicatas.
  const seen = new Set<string>();
  const all = [...live, ...(initial ?? []), ...older].filter((e) => !seen.has(e.id) && seen.add(e.id));

  async function more() {
    const last = all[all.length - 1];
    if (!last) return;
    setLoading(true);
    const rows = await api<AgentEventDto[]>(`/activity?limit=${PAGE}&before=${encodeURIComponent(last.createdAt)}`);
    setOlder((o) => [...o, ...rows]);
    setDone(rows.length < PAGE);
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Panel title="Linha do tempo do JARVIS" code="LOG-ALL">
        <p className="mb-5 text-sm text-ink-dim">
          Tudo o que o JARVIS executou na sua conta, em ordem. Cada item foi registrado no momento da operação.
        </p>
        {initial === null ? (
          <p className="text-sm text-ink-faint">Carregando…</p>
        ) : all.length === 0 ? (
          <p className="text-sm text-ink-faint">Nenhuma operação registrada.</p>
        ) : (
          <ol className="ml-1">
            {all.map((e) => (
              <EventItem key={e.id} event={e} now={now} />
            ))}
          </ol>
        )}
        {!done && initial !== null && all.length > 0 && (
          <button className="hud-btn hud-btn-ghost mt-5 w-full" onClick={more} disabled={loading}>
            {loading ? "Carregando…" : "Carregar mais"}
          </button>
        )}
      </Panel>
    </div>
  );
}
