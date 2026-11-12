"use client";

import { useState } from "react";

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="hud-label">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

/** Lista de textos curtos (cargos, regiões). Enter ou vírgula adiciona. */
export function TagInput({
  value,
  onChange,
  placeholder,
  max = 20,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (t.length >= 2 && !value.some((v) => v.toLowerCase() === t.toLowerCase()) && value.length < max) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className="hud-input flex flex-wrap items-center gap-1.5 !py-1.5">
      {value.map((v) => (
        <span key={v} className="flex items-center gap-1 rounded-sm border border-cyan/40 bg-cyan/10 px-2 py-0.5 text-sm text-ink">
          {v}
          <button type="button" aria-label={`Remover ${v}`} className="text-ink-dim hover:text-red" onClick={() => onChange(value.filter((x) => x !== v))}>
            ×
          </button>
        </span>
      ))}
      <input
        className="min-w-32 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-ink-faint"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

/** Seleção múltipla em chips. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={`rounded-sm border px-3 py-1.5 text-sm transition-colors ${
              on ? "border-cyan bg-cyan/15 text-cyan" : "border-line text-ink-dim hover:border-line-strong hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SaveBar({ saving, saved, onSave }: { saving: boolean; saved: boolean; onSave: () => void }) {
  return (
    <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-4">
      {saved && <span className="font-mono text-xs text-green">Salvo</span>}
      <button type="button" className="hud-btn" onClick={onSave} disabled={saving}>
        {saving ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}
