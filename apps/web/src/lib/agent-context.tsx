"use client";

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useRef, useState } from "react";
import type { AgentEventDto, AgentStateSnapshot, StreamMessage } from "@jarvis/shared";
import { API_URL, api, refreshSession } from "./api";

export type LinkStatus = "connecting" | "live" | "reconnecting";

interface AgentContextValue {
  snapshot: AgentStateSnapshot | null;
  events: AgentEventDto[];
  link: LinkStatus;
  /** Incrementa a cada evento novo recebido ao vivo — o núcleo reage a ele. */
  pulse: number;
}

const AgentContext = createContext<AgentContextValue | null>(null);

const MAX_EVENTS = 60;

/**
 * Um único EventSource por aba. O estado exibido no HUD é sempre o que o backend
 * publicou; o cliente nunca inventa estados.
 */
export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<AgentStateSnapshot | null>(null);
  const [events, setEvents] = useState<AgentEventDto[]>([]);
  const [link, setLink] = useState<LinkStatus>("connecting");
  const [pulse, setPulse] = useState(0);
  const retryRef = useRef(0);

  const addEvent = useCallback((event: AgentEventDto) => {
    setEvents((prev) => (prev.some((e) => e.id === event.id) ? prev : [event, ...prev].slice(0, MAX_EVENTS)));
  }, []);

  useEffect(() => {
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    api<AgentEventDto[]>("/activity?limit=30")
      .then((initial) => setEvents((prev) => [...prev, ...initial.filter((e) => !prev.some((p) => p.id === e.id))]))
      .catch(() => undefined);

    const connect = () => {
      source = new EventSource(`${API_URL}/activity/stream`, { withCredentials: true });
      source.onopen = () => {
        retryRef.current = 0;
        setLink("live");
      };
      source.onmessage = (ev: MessageEvent<string>) => {
        const msg = JSON.parse(ev.data) as StreamMessage;
        if (msg.kind === "state") setSnapshot(msg.snapshot);
        if (msg.kind === "event") {
          addEvent(msg.event);
          setPulse((p) => p + 1);
        }
      };
      source.onerror = () => {
        // O EventSource não expõe o status HTTP: fechamos, renovamos a sessão e reconectamos com backoff.
        source?.close();
        if (closed) return;
        setLink("reconnecting");
        const delay = Math.min(15_000, 1_000 * 2 ** retryRef.current++);
        timer = setTimeout(async () => {
          await refreshSession();
          if (!closed) connect();
        }, delay);
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(timer);
      source?.close();
    };
  }, [addEvent]);

  return <AgentContext.Provider value={{ snapshot, events, link, pulse }}>{children}</AgentContext.Provider>;
}

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent fora de AgentProvider");
  return ctx;
}

/** Executa `onEvent` quando chega ao vivo um evento cujo tipo começa com `prefix`. */
export function useAgentEvent(prefix: string, onEvent: (e: AgentEventDto) => void) {
  const { events } = useAgent();
  const lastSeen = useRef<string | null>(null);
  const fire = useEffectEvent(onEvent);

  useEffect(() => {
    const latest = events[0];
    if (!latest) return;
    if (lastSeen.current === null) {
      lastSeen.current = latest.id;
      return;
    }
    if (latest.id !== lastSeen.current) {
      lastSeen.current = latest.id;
      if (latest.type.startsWith(prefix)) fire(latest);
    }
  }, [events, prefix]);
}
