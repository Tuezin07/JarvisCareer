"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatMessageDto, ConversationDto, ToolActivity, UsageSummaryDto } from "@jarvis/shared";
import { ErrorNote, Panel } from "@/components/hud";
import { ApiError, api } from "@/lib/api";
import { sendChatMessage } from "@/lib/chat-stream";

interface Status {
  configured: boolean;
  model: string;
  usage: UsageSummaryDto;
}

const SUGGESTIONS = [
  "O que você fez na minha conta nas últimas 24 horas?",
  "Meu currículo está bom para uma vaga de desenvolvedor júnior?",
  "Não quero trabalhar aos finais de semana.",
  "Quais competências estão faltando para meu primeiro emprego?",
];

const TOOL_COLOR: Record<ToolActivity["status"], string> = {
  running: "var(--cyan)",
  succeeded: "var(--green)",
  failed: "var(--red)",
  denied: "var(--amber)",
};

function ToolChips({ tools }: { tools: ToolActivity[] }) {
  if (tools.length === 0) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Ferramentas usadas">
      {tools.map((t) => (
        <li
          key={t.toolUseId}
          className="flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[11px]"
          style={{ borderColor: TOOL_COLOR[t.status], color: TOOL_COLOR[t.status] }}
          title={t.summary ?? undefined}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${t.status === "running" ? "animate-pulse" : ""}`} style={{ background: TOOL_COLOR[t.status] }} />
          {t.label}
          {t.summary && t.status !== "running" && <span className="text-ink-faint">· {t.summary}</span>}
        </li>
      ))}
    </ul>
  );
}

function Bubble({ m, streaming }: { m: ChatMessageDto; streaming?: boolean }) {
  if (m.role === "user") {
    return (
      <div className="hud-enter ml-auto max-w-[85%] rounded border border-cyan/30 bg-cyan/10 px-4 py-2.5 text-[15px] text-ink whitespace-pre-wrap">
        {m.text}
      </div>
    );
  }
  return (
    <div className="hud-enter max-w-[92%]">
      <p className="hud-label mb-1.5 text-cyan">JARVIS</p>
      <ToolChips tools={m.tools} />
      <div className="prose-jarvis text-[15px] leading-relaxed text-ink">
        {m.text ? <ReactMarkdown>{m.text}</ReactMarkdown> : streaming ? <span className="text-ink-faint">…</span> : null}
        {streaming && m.text && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-cyan align-middle" />}
      </div>
    </div>
  );
}

export default function ConversationView() {
  const [status, setStatus] = useState<Status | null>(null);
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<ChatMessageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshStatus = useCallback(() => api<Status>("/intelligence/status").then(setStatus).catch(() => undefined), []);

  useEffect(() => {
    void refreshStatus();
    api<ConversationDto[]>("/conversations")
      .then((list) => {
        setConversations(list);
        if (list[0]) setActiveId(list[0].id);
      })
      .catch(() => setError("Não foi possível carregar as conversas."));
    return () => abortRef.current?.abort();
  }, [refreshStatus]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    api<ChatMessageDto[]>(`/conversations/${activeId}/messages`)
      .then((rows) => !cancelled && setMessages(rows))
      .catch(() => !cancelled && setError("Não foi possível carregar as mensagens."));
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming]);

  async function newConversation() {
    const c = await api<ConversationDto>("/conversations", { method: "POST", json: {} });
    setConversations((cs) => [c, ...cs]);
    setMessages([]);
    setActiveId(c.id);
    return c.id;
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming) return;
    setError(null);
    setDraft("");
    const conversationId = activeId ?? (await newConversation());
    const reply: ChatMessageDto = { id: "streaming", role: "assistant", text: "", tools: [], createdAt: new Date().toISOString() };
    setStreaming(reply);
    abortRef.current = new AbortController();

    let current = reply;
    const update = (patch: Partial<ChatMessageDto>) => {
      current = { ...current, ...patch };
      setStreaming(current);
    };

    try {
      await sendChatMessage(
        conversationId,
        content,
        (e) => {
          if (e.type === "user_message") setMessages((ms) => [...ms, e.message]);
          else if (e.type === "text") update({ text: current.text + e.delta });
          else if (e.type === "tool") {
            const others = current.tools.filter((t) => t.toolUseId !== e.activity.toolUseId);
            update({ tools: [...others, e.activity] });
          } else if (e.type === "error") setError(e.message);
        },
        abortRef.current.signal,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "A conexão com o JARVIS caiu.");
      if (!current.text && current.tools.length === 0) setDraft(content);
    } finally {
      setStreaming(null);
      // A versão persistida é a fonte da verdade (inclui o estado final de cada ferramenta).
      const rows = await api<ChatMessageDto[]>(`/conversations/${conversationId}/messages`).catch(() => null);
      if (rows) setMessages(rows);
      const list = await api<ConversationDto[]>("/conversations").catch(() => null);
      if (list) setConversations(list);
      void refreshStatus();
    }
  }

  const disabled = status !== null && !status.configured;

  return (
    <div className="grid h-[calc(100vh-8.5rem)] gap-5 lg:grid-cols-[260px_1fr]">
      <Panel title="Conversas" code="CHT-LST" className="hidden min-h-0 flex-col lg:flex">
        <button className="hud-btn hud-btn-ghost mb-3 w-full" onClick={() => void newConversation()} disabled={!!streaming}>
          + Nova conversa
        </button>
        <ul className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setActiveId(c.id)}
                disabled={!!streaming}
                className={`w-full truncate rounded px-2.5 py-2 text-left text-sm ${
                  c.id === activeId ? "bg-cyan/10 text-cyan" : "text-ink-dim hover:bg-cyan/5 hover:text-ink"
                }`}
              >
                {c.title}
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <section className="hud-panel flex min-h-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h1 className="hud-label flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan shadow-[0_0_8px_var(--cyan)]" /> Canal de comando
          </h1>
          {status && (
            <span className="font-mono text-[11px] text-ink-faint" title="Consumo de IA nas últimas 24 horas">
              {status.model} · US$ {status.usage.todayUsd.toFixed(3)} / {status.usage.dailyBudgetUsd.toFixed(2)} em 24 h
            </span>
          )}
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5" aria-live="polite">
          {disabled && (
            <p className="rounded border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
              A IA não está configurada neste ambiente. Defina ANTHROPIC_API_KEY em apps/api/.env e reinicie a API.
            </p>
          )}
          {messages.length === 0 && !streaming && !disabled && (
            <div className="mx-auto max-w-lg pt-8 text-center">
              <p className="hud-title text-xl text-ink">Como posso ajudar na sua busca?</p>
              <p className="mt-2 text-sm text-ink-dim">
                Eu consulto seus dados reais: perfil, currículos e o histórico da conta. Pesquisa de vagas e envio de candidaturas ainda não
                estão disponíveis.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded border border-line px-3 py-2.5 text-left text-sm text-ink-dim transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
          {streaming && <Bubble m={streaming} streaming />}
          <div ref={endRef} />
        </div>

        <form
          className="border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <ErrorNote message={error} />
          <div className="mt-2 flex items-end gap-2">
            <textarea
              className="hud-input min-h-[46px] flex-1 resize-none"
              rows={1}
              maxLength={4000}
              placeholder={disabled ? "IA indisponível" : "Fale com o JARVIS…  (Enter envia, Shift+Enter quebra linha)"}
              value={draft}
              disabled={disabled}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              aria-label="Mensagem para o JARVIS"
            />
            {streaming ? (
              <button type="button" className="hud-btn hud-btn-danger" onClick={() => abortRef.current?.abort()}>
                Parar
              </button>
            ) : (
              <button className="hud-btn" disabled={disabled || !draft.trim()}>
                Enviar
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
