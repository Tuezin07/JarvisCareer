"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerSchema } from "@jarvis/shared";
import { ErrorNote } from "@/components/hud";
import { ApiError, api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", acceptTerms: false, acceptPrivacy: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Mesma validação da API (contrato compartilhado), para erro imediato.
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Verifique os campos");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/register", { method: "POST", json: parsed.data });
      router.replace("/perfil");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível conectar à API.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="hud-panel hud-enter p-6 sm:p-8" noValidate>
      <p className="hud-label">Novo candidato</p>
      <h1 className="hud-title mt-2 text-2xl font-semibold text-ink">Criar conta</h1>

      <label className="mt-6 block">
        <span className="hud-label">Nome completo</span>
        <input className="hud-input mt-1.5" autoComplete="name" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
      </label>
      <label className="mt-4 block">
        <span className="hud-label">E-mail</span>
        <input className="hud-input mt-1.5" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
      </label>
      <label className="mt-4 block">
        <span className="hud-label">Senha (mínimo 10 caracteres)</span>
        <input
          className="hud-input mt-1.5"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
        />
      </label>

      <fieldset className="mt-5 space-y-2.5 text-sm text-ink-dim">
        <label className="flex items-start gap-2.5">
          <input type="checkbox" className="mt-1 accent-cyan" checked={form.acceptTerms} onChange={(e) => set("acceptTerms", e.target.checked)} />
          <span>
            Li e aceito os{" "}
            <Link href="/legal" className="text-cyan hover:underline" target="_blank">
              termos de uso
            </Link>
            .
          </span>
        </label>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" className="mt-1 accent-cyan" checked={form.acceptPrivacy} onChange={(e) => set("acceptPrivacy", e.target.checked)} />
          <span>
            Li e aceito a{" "}
            <Link href="/legal#privacidade" className="text-cyan hover:underline" target="_blank">
              política de privacidade
            </Link>{" "}
            e o tratamento dos meus dados para a busca de emprego.
          </span>
        </label>
      </fieldset>

      <ErrorNote message={error} />

      <button className="hud-btn mt-6 w-full" disabled={busy}>
        {busy ? "Criando conta…" : "Criar conta"}
      </button>
      <p className="mt-5 text-center text-sm text-ink-dim">
        Já tem conta?{" "}
        <Link href="/login" className="text-cyan hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
