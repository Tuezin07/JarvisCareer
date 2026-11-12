"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RESUME_MAX_BYTES, type ResumeDetailDto, type ResumeDto, type ResumeStatus } from "@jarvis/shared";
import { ErrorNote, Panel, useNow } from "@/components/hud";
import { useAgentEvent } from "@/lib/agent-context";
import { ApiError, api, formatBytes, timeAgo } from "@/lib/api";

const STATUS: Record<ResumeStatus, { text: string; color: string }> = {
  UPLOADED: { text: "Na fila", color: "var(--text-dim)" },
  PROCESSING: { text: "Lendo", color: "var(--cyan)" },
  EXTRACTED: { text: "Lido", color: "var(--green)" },
  FAILED: { text: "Falhou", color: "var(--red)" },
};

export default function ResumesPage() {
  const [items, setItems] = useState<ResumeDto[] | null>(null);
  const [selected, setSelected] = useState<ResumeDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedId = useRef<string | null>(null);
  const now = useNow();

  const load = useCallback(async () => {
    const list = await api<ResumeDto[]>("/resumes");
    setItems(list);
    // Mantém o painel de texto coerente com a lista (atualizado ou fechado se o item sumiu).
    const id = selectedId.current;
    if (id && list.some((r) => r.id === id)) {
      setSelected(await api<ResumeDetailDto>(`/resumes/${id}`));
    } else if (id) {
      selectedId.current = null;
      setSelected(null);
    }
    return list;
  }, []);

  const open = useCallback(async (id: string) => {
    selectedId.current = id;
    setSelected(await api<ResumeDetailDto>(`/resumes/${id}`));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<ResumeDto[]>("/resumes")
      .then((list) => !cancelled && setItems(list))
      .catch(() => !cancelled && setError("Não foi possível carregar os currículos."));
    return () => {
      cancelled = true;
    };
  }, []);

  // O worker publica eventos resume.*: a lista se atualiza sozinha.
  useAgentEvent("resume.", () => {
    void load();
  });

  async function upload(file: File) {
    setError(null);
    if (file.size > RESUME_MAX_BYTES) {
      setError(`Arquivo maior que ${formatBytes(RESUME_MAX_BYTES)}.`);
      return;
    }
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    try {
      await api<ResumeDto>("/resumes", { method: "POST", body });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha no envio.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Operação falhou.");
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_minmax(320px,520px)]">
      <div className="flex flex-col gap-5">
        <Panel title="Enviar currículo" code="UPL-01">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) void upload(f);
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded border border-dashed px-4 py-10 text-center transition-colors ${
              dragging ? "border-cyan bg-cyan/10" : "border-line-strong"
            }`}
          >
            <p className="text-ink">Arraste o arquivo aqui</p>
            <p className="text-sm text-ink-dim">PDF, DOCX ou TXT · até {formatBytes(RESUME_MAX_BYTES)}</p>
            <button className="hud-btn mt-2" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? "Enviando…" : "Escolher arquivo"}
            </button>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
          </div>
          <ErrorNote message={error} />
        </Panel>

        <Panel title="Seus currículos" code="CVS-LST">
          {items === null ? (
            <p className="text-sm text-ink-faint">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-ink-faint">Nenhum currículo enviado.</p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                  <button onClick={() => void open(r.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-ink hover:text-cyan">{r.originalName}</span>
                      {r.isPrimary && (
                        <span className="rounded-sm border border-cyan/50 px-1.5 font-mono text-[10px] uppercase text-cyan">Principal</span>
                      )}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-ink-faint">
                      {r.kind.toUpperCase()} · {formatBytes(r.sizeBytes)}
                      {r.pageCount ? ` · ${r.pageCount} pág.` : ""}
                      {r.charCount !== null ? ` · ${r.charCount.toLocaleString("pt-BR")} caracteres` : ""} · {timeAgo(r.createdAt, now)}
                    </span>
                  </button>
                  <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase" style={{ color: STATUS[r.status].color }}>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${r.status === "PROCESSING" || r.status === "UPLOADED" ? "animate-pulse" : ""}`}
                      style={{ background: STATUS[r.status].color }}
                    />
                    {STATUS[r.status].text}
                  </span>
                  <div className="flex gap-2">
                    {!r.isPrimary && (
                      <button className="hud-btn hud-btn-ghost !px-2.5 !py-1" onClick={() => act(() => api(`/resumes/${r.id}/primary`, { method: "POST" }))}>
                        Principal
                      </button>
                    )}
                    {r.status === "FAILED" && (
                      <button className="hud-btn hud-btn-ghost !px-2.5 !py-1" onClick={() => act(() => api(`/resumes/${r.id}/reprocess`, { method: "POST" }))}>
                        Tentar de novo
                      </button>
                    )}
                    <button
                      className="hud-btn hud-btn-danger !px-2.5 !py-1"
                      onClick={() => {
                        if (confirm(`Excluir "${r.originalName}"? O arquivo será apagado definitivamente.`)) {
                          void act(() => api(`/resumes/${r.id}`, { method: "DELETE" }));
                        }
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                  {r.errorMessage && <p className="w-full text-xs text-red">{r.errorMessage}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Texto extraído" code="TXT-RAW" className="lg:sticky lg:top-20 lg:self-start">
        {selected ? (
          <>
            <p className="mb-3 text-sm text-ink">{selected.originalName}</p>
            {selected.extractedText ? (
              <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded border border-line bg-bg/70 p-3 font-mono text-[12.5px] leading-relaxed text-ink-dim">
                {selected.extractedText}
              </pre>
            ) : (
              <p className="text-sm text-ink-faint">Ainda sem texto extraído ({STATUS[selected.status].text.toLowerCase()}).</p>
            )}
            <p className="mt-3 text-xs text-ink-faint">
              Esta é a leitura literal do documento. A análise com diagnóstico e pontuação chega na Fase 2.
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-faint">Selecione um currículo para ver o que o JARVIS leu.</p>
        )}
      </Panel>
    </div>
  );
}
