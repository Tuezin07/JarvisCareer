"use client";

import type { ResumeAnalysisDto } from "@jarvis/shared";
import { Gauge } from "./hud";

const SEVERITY = {
  ALTA: { text: "Alta", color: "var(--red)" },
  MEDIA: { text: "Média", color: "var(--amber)" },
  BAIXA: { text: "Baixa", color: "var(--text-dim)" },
} as const;

const ISSUE_LABEL: Record<string, string> = {
  ORTOGRAFIA: "Ortografia",
  ORGANIZACAO: "Organização",
  REDUNDANCIA: "Redundância",
  DESCRICAO_FRACA: "Descrição fraca",
  COMPETENCIA_SEM_EVIDENCIA: "Competência sem evidência",
  PALAVRAS_CHAVE: "Palavras-chave",
  FORMATACAO: "Formatação",
  ATS: "Leitura por ATS",
  INCONSISTENCIA: "Inconsistência",
  DESTAQUE: "Merece destaque",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="hud-label mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Bullets({ items, color = "var(--cyan)" }: { items: string[]; color?: string }) {
  if (items.length === 0) return <p className="text-sm text-ink-faint">Nada a destacar.</p>;
  return (
    <ul className="space-y-1.5 text-sm text-ink-dim">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-sm" style={{ background: color }} />
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );
}

/** Relatório da análise: nota com critérios explicados, problemas, recomendações e limitações. */
export function AnalysisReport({ analysis }: { analysis: ResumeAnalysisDto }) {
  if (analysis.status === "QUEUED" || analysis.status === "RUNNING") {
    return (
      <p className="flex items-center gap-2 text-sm text-cyan" role="status">
        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan" />
        {analysis.status === "QUEUED" ? "Análise na fila…" : "A IA está analisando o currículo (pode levar alguns minutos)…"}
      </p>
    );
  }
  if (analysis.status === "FAILED" || !analysis.result || !analysis.criteria) {
    return <p className="text-sm text-red">A análise falhou: {analysis.error ?? "erro desconhecido"}.</p>;
  }
  const r = analysis.result;

  return (
    <div className="space-y-4">
      <Gauge value={analysis.score ?? 0} label="Qualidade documental" sub="Mede o documento, não a chance de contratação." />
      <p className="text-sm leading-relaxed text-ink">{r.summary}</p>

      <Section title="Como a nota foi calculada">
        <ul className="space-y-3">
          {analysis.criteria.map((c) => (
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
              <p className="mt-1 text-xs leading-relaxed text-ink-dim">{c.rationale}</p>
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Pontos fortes">
          <Bullets items={r.strengths} color="var(--green)" />
        </Section>
        <Section title="Pontos fracos">
          <Bullets items={r.weaknesses} color="var(--amber)" />
        </Section>
      </div>

      <Section title={`Problemas encontrados (${r.issues.length})`}>
        {r.issues.length === 0 ? (
          <p className="text-sm text-ink-faint">Nenhum.</p>
        ) : (
          <ul className="space-y-3">
            {r.issues.map((i, idx) => (
              <li key={idx} className="rounded border border-line p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] uppercase" style={{ color: SEVERITY[i.severity].color }}>
                    {SEVERITY[i.severity].text}
                  </span>
                  <span className="text-ink">{ISSUE_LABEL[i.type] ?? i.type}</span>
                </div>
                {i.excerpt && <blockquote className="mt-1.5 border-l-2 border-line-strong pl-2 font-mono text-xs text-ink-dim">{i.excerpt}</blockquote>}
                <p className="mt-1.5 text-ink-dim">{i.explanation}</p>
                <p className="mt-1 text-cyan">→ {i.suggestion}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recomendações práticas">
        <Bullets items={r.recommendations} />
      </Section>

      <Section title="Vagas compatíveis com o perfil">
        <Bullets items={r.compatibleRoles.map((c) => `${c.role} — ${c.reason}`)} />
      </Section>

      <Section title="Competências para desenvolver">
        <Bullets items={r.skillsToDevelop.map((s) => `${s.skill} — ${s.why}`)} />
      </Section>

      {r.missingInformation.length > 0 && (
        <Section title="Informações ausentes">
          <Bullets items={r.missingInformation} color="var(--amber)" />
        </Section>
      )}

      <Section title="Limitações desta análise">
        <Bullets items={r.limitations} color="var(--text-faint)" />
      </Section>

      <p className="font-mono text-[11px] text-ink-faint">
        {analysis.model} · {analysis.completedAt ? new Date(analysis.completedAt).toLocaleString("pt-BR") : ""}
      </p>
    </div>
  );
}
