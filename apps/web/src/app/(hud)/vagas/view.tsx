"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  JOB_PROVIDER_LABEL,
  type JobDetailDto,
  type JobListItemDto,
  type JobMatchStatus,
  type JobsListResponse,
  type JobSourceDto,
} from "@jarvis/shared";
import { JobDetail, scoreColor, WORKPLACE_LABEL } from "@/components/JobDetail";
import { ErrorNote, Panel, useNow } from "@/components/hud";
import { useAgentEvent } from "@/lib/agent-context";
import { ApiError, api, timeAgo } from "@/lib/api";

const PAGE = 30;

interface Filters {
  q: string;
  minScore: number;
  includeEliminated: boolean;
  saved: boolean;
}

function query(f: Filters, offset: number) {
  const p = new URLSearchParams({
    limit: String(PAGE),
    offset: String(offset),
    minScore: String(f.minScore),
  });
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.includeEliminated) p.set("includeEliminated", "true");
  if (f.saved) p.set("status", "SAVED");
  return `/jobs?${p}`;
}

export default function JobsView() {
  const [sources, setSources] = useState<JobSourceDto[]>([]);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    q: "",
    minScore: 0,
    includeEliminated: false,
    saved: false,
  });
  const [list, setList] = useState<JobsListResponse | null>(null);
  const [selected, setSelected] = useState<JobDetailDto | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const now = useNow();

  const loadSources = useCallback(() => api<JobSourceDto[]>("/jobs/sources").then(setSources), []);
  // Sempre com os filtros atuais (useAgentEvent chama a versão mais recente do callback).
  const loadJobs = async () => {
    setList(await api<JobsListResponse>(query(filters, 0)));
  };

  useEffect(() => {
    void loadSources().catch(() => setError("Falha ao carregar empresas."));
  }, [loadSources]);

  // Filtros mudaram: recarrega (com pequeno atraso para a digitação).
  useEffect(() => {
    const t = setTimeout(() => {
      void api<JobsListResponse>(query(filters, 0))
        .then(setList)
        .catch(() => setError("Falha ao carregar vagas."));
    }, 250);
    return () => clearTimeout(t);
  }, [filters]);

  // O worker publica jobs.*: fontes sincronizadas e novas compatibilidades atualizam a tela.
  useAgentEvent("jobs.", () => {
    void loadSources();
    void loadJobs();
  });

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    setBusy(true);
    setError(null);
    // Link de vaga específica importa só ela; link de página acompanha a empresa.
    const isJob = /\/jobs\/\d+|gh_jid=|jobs\.(eu\.)?lever\.co\/[^/]+\/[0-9a-f-]{36}|jobs\.ashbyhq\.com\/[^/]+\/[0-9a-f-]{36}/i.test(link);
    try {
      if (isJob) await api("/jobs/import", { method: "POST", json: { url: link } });
      else await api("/jobs/sources", { method: "POST", json: { url: link } });
      setLink("");
      await loadSources();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao adicionar.");
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Operação falhou.");
    }
  }

  async function open(id: string) {
    await act(async () => setSelected(await api<JobDetailDto>(`/jobs/${id}`)));
    // Abaixo de xl o detalhe fica depois da lista: leva o candidato até ele.
    if (window.matchMedia("(max-width: 1279px)").matches) {
      requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
    }
  }

  async function setStatus(status: JobMatchStatus) {
    if (!selected) return;
    await act(async () => {
      setSelected(
        await api<JobDetailDto>(`/jobs/${selected.id}/status`, {
          method: "POST",
          json: { status },
        }),
      );
      await loadJobs();
    });
  }

  async function more() {
    if (!list) return;
    const next = await api<JobsListResponse>(query(filters, list.items.length));
    setList({ total: next.total, items: [...list.items, ...next.items] });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_minmax(360px,560px)]">
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Empresas acompanhadas" code="SRC-01">
          <form onSubmit={addSource} className="flex flex-col gap-2 sm:flex-row">
            <input
              className="hud-input"
              placeholder="Cole o link da página de vagas ou de uma vaga (Greenhouse, Lever, Ashby)"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              aria-label="Link da página de vagas"
            />
            <button className="hud-btn shrink-0" disabled={busy || !link.trim()}>
              {busy ? "Verificando…" : "Adicionar"}
            </button>
          </form>
          <p className="mt-2 text-xs text-ink-faint">
            Ex.: job-boards.greenhouse.io/empresa · jobs.lever.co/empresa · jobs.ashbyhq.com/empresa. As vagas são lidas pelas APIs públicas
            oficiais, agora e a cada 6 horas. LinkedIn, Gupy e outros portais ainda não são suportados.
          </p>
          <ErrorNote message={error} />
          {sources.length > 0 && (
            <ul className="mt-4 divide-y divide-line">
              {sources.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate text-sm text-ink">{s.companyName}</p>
                    <p className="font-mono text-[11px] text-ink-faint">
                      {JOB_PROVIDER_LABEL[s.provider]} · {s.openJobCount ?? "—"} vaga(s) ·{" "}
                      {s.lastSyncedAt ? `lida ${timeAgo(s.lastSyncedAt, now)}` : "lendo agora…"}
                    </p>
                    {s.status !== "ACTIVE" && (
                      <p className="text-xs text-red">
                        {s.status === "DISABLED" ? "Desligada" : "Com falhas"}: {s.lastError}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="hud-btn hud-btn-ghost !px-2.5 !py-1"
                      onClick={() => act(() => api(`/jobs/sources/${s.id}/sync`, { method: "POST" }))}
                    >
                      Atualizar
                    </button>
                    <button
                      className="hud-btn hud-btn-danger !px-2.5 !py-1"
                      onClick={() => {
                        if (confirm(`Deixar de acompanhar ${s.companyName}? As vagas não salvas saem da lista.`)) {
                          void act(async () => {
                            await api(`/jobs/sources/${s.id}`, {
                              method: "DELETE",
                            });
                            await loadSources();
                            await loadJobs();
                          });
                        }
                      }}
                    >
                      Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Vagas compatíveis"
          code="JOB-LST"
          action={list && <span className="font-mono text-xs text-ink-faint">{list.total} vaga(s)</span>}
        >
          <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
            <input
              className="hud-input"
              placeholder="Filtrar por cargo, empresa ou palavra"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              aria-label="Filtrar vagas"
            />
            <select
              className="hud-input sm:w-40"
              value={filters.minScore}
              onChange={(e) => setFilters((f) => ({ ...f, minScore: Number(e.target.value) }))}
              aria-label="Nota mínima"
            >
              <option value={0}>Qualquer nota</option>
              <option value={50}>Nota ≥ 50</option>
              <option value={70}>Nota ≥ 70</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-ink-dim">
              <input
                type="checkbox"
                className="accent-cyan"
                checked={filters.saved}
                onChange={(e) => setFilters((f) => ({ ...f, saved: e.target.checked }))}
              />
              Salvas
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-dim">
              <input
                type="checkbox"
                className="accent-cyan"
                checked={filters.includeEliminated}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    includeEliminated: e.target.checked,
                  }))
                }
              />
              Eliminadas
            </label>
          </div>

          {list === null ? (
            <p className="text-sm text-ink-faint">Carregando…</p>
          ) : list.items.length === 0 ? (
            <p className="text-sm text-ink-faint">
              {sources.length === 0
                ? "Adicione uma empresa acima para o JARVIS começar a ler as vagas."
                : "Nenhuma vaga com esses filtros."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {list.items.map((j: JobListItemDto) => (
                <li key={j.id}>
                  <button
                    onClick={() => void open(j.id)}
                    className={`flex w-full gap-3 py-3 text-left transition-colors hover:bg-cyan/5 ${selected?.id === j.id ? "bg-cyan/10" : ""}`}
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 font-mono text-sm"
                      style={{
                        borderColor: scoreColor(j.score, j.eliminated),
                        color: scoreColor(j.score, j.eliminated),
                      }}
                      aria-label={`Compatibilidade ${j.score}`}
                    >
                      {j.score}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{j.title}</span>
                        {j.status === "SAVED" && <span className="text-amber">★</span>}
                      </span>
                      <span className="block truncate text-xs text-ink-dim">
                        {j.companyName} · {j.locations[0] ?? "local não informado"} · {WORKPLACE_LABEL[j.workplaceType]}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-faint">{j.topReasons.join(" · ")}</span>
                      <span className="mt-1 flex gap-1.5">
                        {j.eliminated && (
                          <span className="rounded-sm border border-amber/50 px-1.5 font-mono text-[10px] uppercase text-amber">
                            Eliminada
                          </span>
                        )}
                        {j.fraudRisk !== "LOW" && (
                          <span className="rounded-sm border border-red/50 px-1.5 font-mono text-[10px] uppercase text-red">
                            Risco {j.fraudRisk.toLowerCase()}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list && list.items.length < list.total && (
            <button className="hud-btn hud-btn-ghost mt-4 w-full" onClick={() => void more()}>
              Carregar mais
            </button>
          )}
        </Panel>
      </div>

      <div ref={detailRef} className="scroll-mt-20 xl:sticky xl:top-20 xl:max-h-[calc(100vh-7rem)] xl:self-start xl:overflow-y-auto">
        <Panel title="Detalhe e compatibilidade" code="JOB-DTL">
          {selected ? (
            <JobDetail job={selected} onStatus={(s) => void setStatus(s)} />
          ) : (
            <p className="text-sm text-ink-faint">Selecione uma vaga para ver por que ela recebeu essa nota.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
