"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AGENT_STATE_LABEL } from "@jarvis/shared";
import { useAgent } from "@/lib/agent-context";
import { useSession } from "@/lib/session-context";
import { Clock, PhaseBadge } from "./hud";

interface NavItem {
  href: string;
  label: string;
  code: string;
  /** Fase em que a tela passa a existir; ausente = disponível. */
  phase?: number;
}

const NAV: NavItem[] = [
  { href: "/painel", label: "Comando", code: "CMD" },
  { href: "/conversa", label: "Conversa", code: "CHT" },
  { href: "/perfil", label: "Perfil", code: "PRF" },
  { href: "/curriculos", label: "Currículos", code: "CVS" },
  { href: "/vagas", label: "Vagas", code: "JOB" },
  { href: "/navegador", label: "Navegador", code: "WEB" },
  { href: "/atividade", label: "Atividade", code: "LOG" },
  { href: "/privacidade", label: "Privacidade", code: "SEC" },
  { href: "#", label: "Candidaturas", code: "APP", phase: 5 },
  { href: "#", label: "Desktop", code: "DSK", phase: 6 },
  { href: "#", label: "Relatórios", code: "RPT", phase: 8 },
];

const LINK_TEXT = { connecting: "Conectando", live: "Link ativo", reconnecting: "Reconectando" } as const;

export function HudShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, logout } = useSession();
  const { link, snapshot } = useAgent();
  const state = snapshot?.state ?? "idle";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4">
          <Link href="/painel" className="flex items-center gap-2.5" aria-label="JARVIS Career — início">
            <svg viewBox="0 0 32 32" className="h-7 w-7 text-cyan" aria-hidden>
              <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 4 6 4" />
              <circle cx="16" cy="16" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="16" cy="16" r="3.5" fill="currentColor" />
            </svg>
            <span className="hud-title text-[15px] font-semibold tracking-[0.28em] text-ink">
              JARVIS<span className="text-cyan">·</span>CAREER
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-4">
            <span className="hidden items-center gap-2 sm:flex" title={snapshot?.label ?? undefined}>
              <span className="hud-label">Núcleo</span>
              <span className="font-mono text-xs text-ink">{AGENT_STATE_LABEL[state]}</span>
            </span>
            <span className="flex items-center gap-1.5" aria-live="polite">
              <span
                className={`h-2 w-2 rounded-full ${link === "live" ? "bg-green shadow-[0_0_8px_var(--green)]" : "animate-pulse bg-amber"}`}
              />
              <span className="hud-label hidden md:inline">{LINK_TEXT[link]}</span>
            </span>
            <span className="hidden lg:inline">
              <Clock />
            </span>
            <span className="hidden max-w-40 truncate text-sm text-ink-dim md:inline">{me.fullName}</span>
            <button onClick={logout} className="hud-btn hud-btn-ghost !px-3 !py-1.5">
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col md:flex-row">
        <nav
          aria-label="Seções"
          className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 md:w-56 md:shrink-0 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:py-5"
        >
          {NAV.map((item) => {
            const active = pathname === item.href;
            if (item.phase) {
              return (
                <span
                  key={item.code}
                  className="flex shrink-0 cursor-not-allowed items-center justify-between gap-3 rounded px-3 py-2 text-sm text-ink-faint"
                  title={`Disponível na Fase ${item.phase}`}
                  aria-disabled
                >
                  <span className="flex items-center gap-2.5">
                    <span className="font-mono text-[10px]">{item.code}</span>
                    {item.label}
                  </span>
                  <PhaseBadge phase={item.phase} />
                </span>
              );
            }
            return (
              <Link
                key={item.code}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors ${
                  active ? "bg-cyan/10 text-cyan shadow-[inset_2px_0_0_var(--cyan)]" : "text-ink-dim hover:bg-cyan/5 hover:text-ink"
                }`}
              >
                <span className="font-mono text-[10px] opacity-70">{item.code}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

/** Sequência de inicialização exibida enquanto a sessão é validada. */
export function BootScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5" role="status">
      <svg viewBox="0 0 100 100" className="h-20 w-20 animate-spin text-cyan [animation-duration:2.4s]" aria-hidden>
        <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path d="M50 6 A44 44 0 0 1 94 50" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
      <p className="hud-label">Inicializando sistemas</p>
    </div>
  );
}
