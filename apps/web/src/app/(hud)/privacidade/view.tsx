"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ConsentDto, ConsentType } from "@jarvis/shared";
import { ErrorNote, Panel, PhaseBadge } from "@/components/hud";
import { API_URL, ApiError, api } from "@/lib/api";

const OPTIONAL: Array<{ type: ConsentType; title: string; text: string; phase: number }> = [
  {
    type: "AUTOMATED_APPLICATIONS",
    title: "Envio automatizado de candidaturas",
    text: "Permite que o JARVIS envie candidaturas em seu nome dentro dos critérios que você definir. Sem isso, toda candidatura exige sua aprovação individual.",
    phase: 5,
  },
  {
    type: "EVIDENCE_SCREENSHOTS",
    title: "Screenshots como evidência",
    text: "Permite guardar capturas de tela das operações no navegador como prova do que foi feito. Ficam privadas e com retenção limitada.",
    phase: 4,
  },
];

export default function PrivacyPage() {
  const router = useRouter();
  const [consents, setConsents] = useState<ConsentDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api<ConsentDto[]>("/privacy/consents").then(setConsents).catch(() => setError("Falha ao carregar consentimentos."));
  }, []);

  const granted = (t: ConsentType) => consents.find((c) => c.type === t)?.granted ?? false;

  async function toggle(type: ConsentType) {
    setError(null);
    try {
      setConsents(await api<ConsentDto[]>("/privacy/consents", { method: "POST", json: { type, granted: !granted(type) } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar.");
    }
  }

  async function exportData() {
    const res = await fetch(`${API_URL}/privacy/export`, { credentials: "include" });
    if (!res.ok) {
      setError("Falha na exportação.");
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: "jarvis-career-meus-dados.json" });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDeleting(true);
    try {
      await api("/privacy/delete-account", { method: "POST", json: { password, confirmation } });
      router.replace("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao excluir.");
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <Panel title="Autorizações" code="CNS-01">
        <ul className="divide-y divide-line">
          {OPTIONAL.map((c) => (
            <li key={c.type} className="flex items-start justify-between gap-4 py-4">
              <div>
                <p className="flex items-center gap-2 font-medium text-ink">
                  {c.title} <PhaseBadge phase={c.phase} />
                </p>
                <p className="mt-1 text-sm text-ink-dim">{c.text}</p>
                <p className="mt-1 text-xs text-ink-faint">A funcionalidade ainda não existe; a autorização fica registrada para quando existir.</p>
              </div>
              <button
                role="switch"
                aria-checked={granted(c.type)}
                aria-label={c.title}
                onClick={() => toggle(c.type)}
                className={`relative mt-1 h-6 w-11 shrink-0 rounded-full border transition-colors ${
                  granted(c.type) ? "border-cyan bg-cyan/30" : "border-line-strong bg-bg"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${granted(c.type) ? "left-6 bg-cyan" : "left-1 bg-ink-faint"}`}
                />
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-faint">Cada mudança fica registrada com data e versão dos termos.</p>
      </Panel>

      <Panel title="Seus dados" code="LGPD-18">
        <p className="text-sm text-ink-dim">
          Baixe uma cópia completa dos seus dados (perfil, preferências, currículos com o texto extraído, consentimentos e histórico de atividades) em JSON.
        </p>
        <button className="hud-btn hud-btn-ghost mt-4" onClick={exportData}>
          Exportar meus dados
        </button>
      </Panel>

      <Panel title="Excluir conta" code="DEL-00">
        <form onSubmit={deleteAccount} className="space-y-3">
          <p className="text-sm text-ink-dim">
            Apaga definitivamente sua conta, perfil, currículos (incluindo os arquivos) e histórico. Não pode ser desfeito.
          </p>
          <input
            className="hud-input"
            type="password"
            placeholder="Sua senha"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input className="hud-input" placeholder='Digite "EXCLUIR" para confirmar' value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
          <button className="hud-btn hud-btn-danger" disabled={deleting || confirmation !== "EXCLUIR" || !password}>
            {deleting ? "Excluindo…" : "Excluir minha conta"}
          </button>
        </form>
      </Panel>

      <ErrorNote message={error} />
    </div>
  );
}
