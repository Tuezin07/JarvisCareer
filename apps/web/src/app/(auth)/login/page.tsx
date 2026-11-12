"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorNote } from "@/components/hud";
import { ApiError, api, refreshSession } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Sessão ainda válida (refresh token) leva direto ao painel.
  useEffect(() => {
    refreshSession().then((ok) => ok && router.replace("/painel"));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", json: { email, password } });
      router.replace("/painel");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível conectar à API.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="hud-panel hud-enter p-6 sm:p-8" noValidate>
      <p className="hud-label">Acesso autenticado</p>
      <h1 className="hud-title mt-2 text-2xl font-semibold text-ink">Entrar no JARVIS</h1>

      <label className="mt-6 block">
        <span className="hud-label">E-mail</span>
        <input
          className="hud-input mt-1.5"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="mt-4 block">
        <span className="hud-label">Senha</span>
        <input
          className="hud-input mt-1.5"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      <ErrorNote message={error} />

      <button className="hud-btn mt-6 w-full" disabled={busy || !email || !password}>
        {busy ? "Autenticando…" : "Entrar"}
      </button>
      <p className="mt-5 text-center text-sm text-ink-dim">
        Primeira vez?{" "}
        <Link href="/cadastro" className="text-cyan hover:underline">
          Criar conta
        </Link>
      </p>
    </form>
  );
}
