"use client";

import { BootScreen, HudShell } from "@/components/HudShell";
import { AgentProvider } from "@/lib/agent-context";
import { SessionGate } from "@/lib/session-context";

/** Área autenticada: valida a sessão na API, abre o canal do agente e desenha o HUD. */
export function HudFrame({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate fallback={<BootScreen />}>
      <AgentProvider>
        <HudShell>{children}</HudShell>
      </AgentProvider>
    </SessionGate>
  );
}
