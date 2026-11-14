"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { JOB_PROVIDER_LABEL, type JobDetailDto, type JobMatchStatus } from "@jarvis/shared";
import { ApiError, api } from "@/lib/api";
import { ErrorNote, Gauge } from "./hud";

export const WORKPLACE_LABEL = { REMOTE: "Remota", HYBRID: "Híbrida", ONSITE: "Presencial", UNKNOWN: "Modalidade não informada" } as const;

export function scoreColor(score: number, eliminated: boolean): string {
  if (eliminated) return "var(--amber)";
  if (score >= 70) return "var(--green)";
  if (score >= 50) return "var(--cyan)";
  return "var(--text-faint)";
}

function List({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <section className="border-t border-line pt-3">
      <h3 className="hud-label mb-2">{title}</h3>
      <ul className="space-y-1.5 text-sm text-ink-dim">
        {items.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-sm" style={{ background: color }} />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatSalary(s: NonNullable<JobDetailDto["salary"]>): string {
  const fmt = (n: number | null) => (n == null ? "?" : n.toLocaleString("pt-BR"));
  const period = { YEAR: "/ano", MONTH: "/mês", HOUR: "/hora" }[s.period ?? ""] ?? "";
  return `${s.currency ?? ""} ${fmt(s.min)}${s.max != null && s.max !== s.min ? ` – ${fmt(s.max)}` : ""}${period}`.trim();
}

/** Detalhe da vaga com a explicação completa da compatibilidade. */
export function JobDetail({ job, onStatus }: { job: JobDetailDto; onStatus: (s: JobMatchStatus) => void }) {
  const [showDescription, setShowDescription] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const router = useRouter();
  const b = job.breakdown;

  async function inspect() {
    setInspecting(true);
    setInspectError(null);
    try {
      const s = await api<{ id: string }>("/browser/inspect", { method: "POST", json: { jobId: job.id } });
      router.push(`/navegador?session=${s.id}`);
    } catch (err) {
      setInspectError(err instanceof ApiError ? err.message : "Falha ao abrir o navegador.");
      setInspecting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="hud-title text-lg font-semibold text-ink">{job.title}</h2>
        <p className="mt-1 text-sm text-ink-dim">
          {job.companyName} · {job.locations.slice(0, 3).join(" / ") || "Local não informado"} · {WORKPLACE_LABEL[job.workplaceType]}
        </p>
        <p className="mt-1 font-mono text-[11px] text-ink-faint">
          Fonte: {JOB_PROVIDER_LABEL[job.provider]} (API pública oficial)
          {job.publishedAt ? ` · publicada em ${new Date(job.publishedAt).toLocaleDateString("pt-BR")}` : ""}
          {job.salary ? ` · ${formatSalary(job.salary)}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <a className="hud-btn" href={job.applyUrl ?? job.url} target="_blank" rel="noopener noreferrer">
          Candidatar-se no site oficial ↗
        </a>
        {job.status === "SAVED" ? (
          <button className="hud-btn hud-btn-ghost" onClick={() => onStatus("NEW")}>
            ★ Salva
          </button>
        ) : (
          <button className="hud-btn hud-btn-ghost" onClick={() => onStatus("SAVED")}>
            ☆ Salvar
          </button>
        )}
        <button
          className="hud-btn hud-btn-ghost"
          onClick={() => void inspect()}
          disabled={inspecting}
        >
          {inspecting ? "Abrindo…" : "Inspecionar formulário"}
        </button>
        {job.status !== "DISMISSED" && (
          <button className="hud-btn hud-btn-danger" onClick={() => onStatus("DISMISSED")}>
            Descartar
          </button>
        )}
      </div>
      <ErrorNote message={inspectError} />
      <p className="text-xs text-ink-faint">
        O JARVIS não envia candidaturas nesta fase: você se candidata na página oficial da empresa. “Inspecionar formulário” só lê a página.
      </p>

      {job.fraudRisk !== "LOW" && (
        <div className="rounded border border-red/40 bg-red/10 p-3 text-sm">
          <p className="font-medium text-red">Sinais de risco ({job.fraudRisk.toLowerCase()})</p>
          <ul className="mt-1 space-y-1 text-ink-dim">
            {job.fraudSignals.map((s) => (
              <li key={s.code}>{s.evidence}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-ink-faint">São indícios no texto, não uma acusação. Desconfie de qualquer pedido de pagamento.</p>
        </div>
      )}

      {job.eliminated && (
        <div className="rounded border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
          Fora das suas restrições eliminatórias: {b.eliminatedReasons.join("; ")}.
        </div>
      )}

      <Gauge value={job.score} label="Compatibilidade" sub="Estimativa por regras públicas sobre o texto publicado." />

      <section>
        <h3 className="hud-label mb-2">Como a nota foi calculada</h3>
        <ul className="space-y-2.5">
          {b.criteria.map((c) => (
            <li key={c.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink">
                  {c.label} <span className="font-mono text-[11px] text-ink-faint">peso {c.weight}%</span>
                </span>
                <span className="font-mono text-ink">{c.score}</span>
              </div>
              <div className="mt-1 h-1 rounded bg-line">
                <div className="h-1 rounded bg-cyan" style={{ width: `${c.score}%` }} />
              </div>
              <p className="mt-1 text-xs text-ink-dim">{c.detail}</p>
            </li>
          ))}
        </ul>
        {b.penalties.length > 0 && (
          <p className="mt-2 text-xs text-amber">Penalidades: {b.penalties.map((p) => `${p.reason} (−${p.points})`).join("; ")}</p>
        )}
      </section>

      {(b.matchedSkills.length > 0 || b.missingSkills.length > 0) && (
        <section className="border-t border-line pt-3">
          <h3 className="hud-label mb-2">Competências citadas na vaga</h3>
          <div className="flex flex-wrap gap-1.5">
            {b.matchedSkills.map((s) => (
              <span key={s} className="rounded-sm border border-green/50 px-2 py-0.5 text-xs text-green">
                ✓ {s}
              </span>
            ))}
            {b.missingSkills.map((s) => (
              <span key={s} className="rounded-sm border border-line px-2 py-0.5 text-xs text-ink-dim">
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      <List title="Você atende" items={b.met} color="var(--green)" />
      <List title="Você não atende" items={b.unmet} color="var(--amber)" />
      <List title="Perguntas em aberto (não eliminam)" items={b.questions} color="var(--cyan)" />
      <List title="Limitações da análise" items={b.limitations} color="var(--text-faint)" />

      <section className="border-t border-line pt-3">
        <button className="hud-label text-cyan hover:underline" onClick={() => setShowDescription((v) => !v)}>
          {showDescription ? "▾ Ocultar descrição" : "▸ Ver descrição publicada"}
        </button>
        {showDescription && (
          <pre className="mt-2 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded border border-line bg-bg/70 p-3 font-sans text-[13px] leading-relaxed text-ink-dim">
            {job.description}
          </pre>
        )}
      </section>
    </div>
  );
}
