"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { MeResponse } from "@jarvis/shared";
import { api, refreshSession } from "./api";

interface SessionValue {
  me: MeResponse;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Valida a sessão na API (o backend é a fonte da verdade). Enquanto valida,
 * mostra a sequência de inicialização; sem sessão, manda para o login.
 */
export function SessionGate({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<MeResponse>("/auth/me")
      .catch(async () => {
        // /auth/* não faz refresh automático; tentamos uma vez aqui.
        if (!(await refreshSession())) throw new Error("sem sessão");
        return api<MeResponse>("/auth/me");
      })
      .then((user) => !cancelled && setMe(user))
      .catch(() => !cancelled && router.replace("/login"));
    return () => {
      cancelled = true;
    };
  }, [router]);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }, [router]);

  if (!me) return <>{fallback}</>;
  return <SessionContext.Provider value={{ me, logout }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession fora de SessionGate");
  return ctx;
}
