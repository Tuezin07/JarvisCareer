"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { AgentEventDto, AgentEventLevel } from "@jarvis/shared";
import { timeAgo } from "@/lib/api";

export function Panel({
  title,
  code,
  children,
  className = "",
  action,
}: {
  title: string;
  /** Código técnico exibido no canto (ex.: "TLM-01"). */
  code?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={`hud-panel hud-enter p-4 sm:p-5 ${className}`}>
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="hud-label flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan shadow-[0_0_8px_var(--cyan)]" />
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {action}
          {code && <span className="font-mono text-[10px] text-ink-faint">{code}</span>}
        </div>
      </header>
      {children}
    </section>
  );
}

/** Medidor circular para valores reais 0–100. */
export function Gauge({ value, label, sub }: { value: number; label: string; sub?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--cyan)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.2,0.8,0.2,1)", filter: "drop-shadow(0 0 4px var(--cyan))" }}
        />
        {Array.from({ length: 20 }, (_, i) => (
          <line
            key={i}
            x1="50"
            y1="2"
            x2="50"
            y2="5"
            stroke="var(--line-strong)"
            strokeWidth="1"
            transform={`rotate(${i * 18} 50 50)`}
          />
        ))}
      </svg>
      <div>
        <div className="hud-title text-3xl font-semibold text-ink">
          {clamped}
          <span className="text-base text-ink-dim">%</span>
        </div>
        <div className="text-sm text-ink-dim">{label}</div>
        {sub && <div className="mt-1 text-xs text-ink-faint">{sub}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="border-l border-line pl-3">
      <div className="hud-label">{label}</div>
      <div className="hud-title mt-1 text-2xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-faint">{hint}</div>}
    </div>
  );
}

const LEVEL_COLOR: Record<AgentEventLevel, string> = {
  info: "var(--cyan)",
  success: "var(--green)",
  warning: "var(--amber)",
  error: "var(--red)",
};

export function EventItem({ event, now }: { event: AgentEventDto; now: number }) {
  const color = LEVEL_COLOR[event.level];
  return (
    <li className="hud-enter relative border-l pl-4 pb-4 last:pb-0" style={{ borderColor: "var(--line)" }}>
      <span
        className="absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink">{event.title}</p>
        <time className="shrink-0 font-mono text-[11px] text-ink-faint" dateTime={event.createdAt} title={new Date(event.createdAt).toLocaleString("pt-BR")}>
          {timeAgo(event.createdAt, now)}
        </time>
      </div>
      {event.detail && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-dim">{event.detail}</p>}
    </li>
  );
}

/** Relógio que só renderiza no cliente (evita divergência de hidratação). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const subscribeSecond = (cb: () => void) => {
  const id = setInterval(cb, 1000);
  return () => clearInterval(id);
};
const currentSecond = () => Math.floor(Date.now() / 1000);

/** Relógio só no cliente: no servidor (prerender) o snapshot é null e mostra o marcador. */
export function Clock() {
  const sec = useSyncExternalStore(subscribeSecond, currentSecond, () => null);
  if (sec === null) return <span className="font-mono text-xs text-ink-faint">--:--:--</span>;
  const t = new Date(sec * 1000);
  return (
    <span className="font-mono text-xs tabular-nums text-ink-dim">
      {t.toLocaleTimeString("pt-BR")} · {t.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
    </span>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 rounded border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
      {message}
    </p>
  );
}

export function PhaseBadge({ phase }: { phase: number }) {
  return (
    <span className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">F{phase}</span>
  );
}
