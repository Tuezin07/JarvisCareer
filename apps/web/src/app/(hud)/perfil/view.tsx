"use client";

import { useEffect, useState } from "react";
import {
  BRAZIL_UFS,
  DEFAULT_MATCH_WEIGHTS,
  MATCH_CRITERIA,
  type Constraint,
  type EducationInput,
  type ExperienceInput,
  type MatchWeights,
  type SkillInput,
} from "@jarvis/shared";
import { ChipGroup, Field, SaveBar, TagInput } from "@/components/form";
import { ErrorNote, Panel } from "@/components/hud";
import { ApiError, api } from "@/lib/api";

type WorkMode = "REMOTE" | "HYBRID" | "ONSITE";
type ContractType = "CLT" | "PJ" | "INTERNSHIP" | "APPRENTICE" | "FREELANCE" | "TEMPORARY";
type Schedule = "FULL_TIME" | "PART_TIME";
type Strength = Constraint["strength"];

interface ProfileResponse {
  profile: {
    fullName: string;
    phone: string | null;
    city: string | null;
    state: string | null;
    headline: string | null;
    summary: string | null;
    targetRoles: string[];
    regionsOfInterest: string[];
    availability: string | null;
  } | null;
  preferences: {
    workModes: WorkMode[];
    contractTypes: ContractType[];
    schedules: Schedule[];
    salaryExpectation: number | null;
    firstJob: boolean;
    acceptsNoExperience: boolean;
    constraints: Constraint[];
    matchWeights: MatchWeights | null;
  } | null;
  experiences: Array<ExperienceInput & { id: string }>;
  education: Array<EducationInput & { id: string }>;
  skills: Array<{ name: string; kind: SkillInput["kind"]; level: SkillInput["level"] }>;
}

const WORK_MODES = [
  { value: "REMOTE" as const, label: "Remoto" },
  { value: "HYBRID" as const, label: "Híbrido" },
  { value: "ONSITE" as const, label: "Presencial" },
];
const CONTRACTS = [
  { value: "CLT" as const, label: "CLT" },
  { value: "PJ" as const, label: "PJ" },
  { value: "INTERNSHIP" as const, label: "Estágio" },
  { value: "APPRENTICE" as const, label: "Jovem aprendiz" },
  { value: "FREELANCE" as const, label: "Freelancer" },
  { value: "TEMPORARY" as const, label: "Temporário" },
];
const SCHEDULES = [
  { value: "FULL_TIME" as const, label: "Período integral" },
  { value: "PART_TIME" as const, label: "Meio período" },
];
const STRENGTH_LABEL: Record<Strength, string> = {
  ELIMINATORY: "Eliminatório",
  IMPORTANT: "Importante",
  FLEXIBLE: "Flexível",
};
const CONSTRAINT_LABEL: Record<Constraint["kind"], string> = {
  NO_WEEKENDS: "Não trabalhar aos fins de semana",
  NO_NIGHT_SHIFT: "Não trabalhar à noite",
  NO_ONSITE: "Não trabalhar presencialmente",
  MIN_SALARY: "Salário mínimo (R$)",
  ONLY_REGIONS: "Somente nas regiões",
  EXCLUDED_AREA: "Não trabalhar na área",
};

function useSection() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>) {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await fn();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? [err.message, ...err.details.slice(1)].join(" · ") : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }
  return { saving, saved, error, run };
}

export default function ProfilePage() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  useEffect(() => {
    api<ProfileResponse>("/profile").then(setData);
  }, []);
  if (!data) return <p className="text-sm text-ink-faint">Carregando perfil…</p>;

  return (
    <div className="mx-auto grid max-w-5xl gap-5">
      <BasicSection initial={data.profile} />
      <PreferencesSection initial={data.preferences} />
      <SkillsSection initial={data.skills} />
      <ExperienceSection initial={data.experiences} />
      <EducationSection initial={data.education} />
      <WeightsSection initial={data.preferences?.matchWeights ?? null} />
    </div>
  );
}

function BasicSection({ initial }: { initial: ProfileResponse["profile"] }) {
  const [p, setP] = useState({
    fullName: initial?.fullName ?? "",
    phone: initial?.phone ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    headline: initial?.headline ?? "",
    summary: initial?.summary ?? "",
    targetRoles: initial?.targetRoles ?? [],
    regionsOfInterest: initial?.regionsOfInterest ?? [],
    availability: initial?.availability ?? "",
  });
  const s = useSection();
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setP((x) => ({ ...x, [k]: v }));

  return (
    <Panel title="Dados profissionais" code="PRF-DAT">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo">
          <input className="hud-input" value={p.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </Field>
        <Field label="Telefone">
          <input className="hud-input" inputMode="tel" value={p.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Cidade">
          <input className="hud-input" value={p.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field label="Estado">
          <select className="hud-input" value={p.state} onChange={(e) => set("state", e.target.value)}>
            <option value="">—</option>
            {BRAZIL_UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Título profissional" hint="Ex.: Desenvolvedor júnior, Analista de suporte">
            <input className="hud-input" value={p.headline} onChange={(e) => set("headline", e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Cargos pretendidos" hint="Enter para adicionar">
            <TagInput value={p.targetRoles} onChange={(v) => set("targetRoles", v)} placeholder="Ex.: Suporte técnico" max={15} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Regiões de interesse">
            <TagInput value={p.regionsOfInterest} onChange={(v) => set("regionsOfInterest", v)} placeholder="Ex.: Curitiba e região" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Resumo">
            <textarea className="hud-input min-h-28" value={p.summary} onChange={(e) => set("summary", e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Disponibilidade" hint="Ex.: início imediato, tardes livres">
            <input className="hud-input" value={p.availability} onChange={(e) => set("availability", e.target.value)} />
          </Field>
        </div>
      </div>
      <ErrorNote message={s.error} />
      <SaveBar
        saving={s.saving}
        saved={s.saved}
        onSave={() => s.run(() => api("/profile", { method: "PUT", json: { ...p, state: p.state || null } }))}
      />
    </Panel>
  );
}

function PreferencesSection({ initial }: { initial: ProfileResponse["preferences"] }) {
  const [workModes, setWorkModes] = useState<WorkMode[]>(initial?.workModes ?? []);
  const [contractTypes, setContractTypes] = useState<ContractType[]>(initial?.contractTypes ?? []);
  const [schedules, setSchedules] = useState<Schedule[]>(initial?.schedules ?? []);
  const [salary, setSalary] = useState(initial?.salaryExpectation?.toString() ?? "");
  const [firstJob, setFirstJob] = useState(initial?.firstJob ?? false);
  const [noExp, setNoExp] = useState(initial?.acceptsNoExperience ?? true);
  const [constraints, setConstraints] = useState<Constraint[]>(initial?.constraints ?? []);
  const [newKind, setNewKind] = useState<Constraint["kind"]>("NO_WEEKENDS");
  const [newStrength, setNewStrength] = useState<Strength>("ELIMINATORY");
  const [newValue, setNewValue] = useState("");
  const s = useSection();

  function addConstraint() {
    let c: Constraint;
    if (newKind === "MIN_SALARY") c = { kind: newKind, strength: newStrength, value: Number(newValue) };
    else if (newKind === "ONLY_REGIONS") c = { kind: newKind, strength: newStrength, regions: newValue.split(",").map((r) => r.trim()).filter(Boolean) };
    else if (newKind === "EXCLUDED_AREA") c = { kind: newKind, strength: newStrength, area: newValue.trim() };
    else c = { kind: newKind, strength: newStrength };
    setConstraints((cs) => [...cs.filter((x) => x.kind !== c.kind || ["ONLY_REGIONS", "EXCLUDED_AREA"].includes(c.kind)), c]);
    setNewValue("");
  }

  const describe = (c: Constraint) =>
    c.kind === "MIN_SALARY"
      ? `Salário mínimo de R$ ${c.value.toLocaleString("pt-BR")}`
      : c.kind === "ONLY_REGIONS"
        ? `Somente em: ${c.regions.join(", ")}`
        : c.kind === "EXCLUDED_AREA"
          ? `Fora da área: ${c.area}`
          : CONSTRAINT_LABEL[c.kind];

  const needsValue = newKind === "MIN_SALARY" || newKind === "ONLY_REGIONS" || newKind === "EXCLUDED_AREA";

  return (
    <Panel title="Preferências e restrições" code="PRF-PRE">
      <div className="grid gap-5">
        <Field label="Modalidade">
          <ChipGroup options={WORK_MODES} value={workModes} onChange={setWorkModes} />
        </Field>
        <Field label="Tipo de contratação">
          <ChipGroup options={CONTRACTS} value={contractTypes} onChange={setContractTypes} />
        </Field>
        <Field label="Jornada">
          <ChipGroup options={SCHEDULES} value={schedules} onChange={setSchedules} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Pretensão salarial (R$)">
            <input className="hud-input" inputMode="numeric" value={salary} onChange={(e) => setSalary(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <label className="flex items-center gap-2.5 text-sm text-ink-dim sm:mt-6">
            <input type="checkbox" className="accent-cyan" checked={firstJob} onChange={(e) => setFirstJob(e.target.checked)} />
            Busco o primeiro emprego
          </label>
          <label className="flex items-center gap-2.5 text-sm text-ink-dim sm:mt-6">
            <input type="checkbox" className="accent-cyan" checked={noExp} onChange={(e) => setNoExp(e.target.checked)} />
            Aceito vagas sem exigência de experiência
          </label>
        </div>

        <div>
          <span className="hud-label">Restrições</span>
          <p className="mt-1 text-xs text-ink-faint">
            Eliminatório descarta a vaga. Importante e Flexível reduzem a nota. Quando a vaga não informa o dado, nada é descartado — vira
            pergunta a esclarecer.
          </p>
          {constraints.length > 0 && (
            <ul className="mt-3 space-y-2">
              {constraints.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2 text-sm">
                  <span className="text-ink">{describe(c)}</span>
                  <span className="flex items-center gap-3">
                    <span
                      className="font-mono text-[11px] uppercase"
                      style={{ color: c.strength === "ELIMINATORY" ? "var(--amber)" : "var(--text-dim)" }}
                    >
                      {STRENGTH_LABEL[c.strength]}
                    </span>
                    <button
                      type="button"
                      className="text-ink-dim hover:text-red"
                      aria-label="Remover restrição"
                      onClick={() => setConstraints((cs) => cs.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_150px_1fr_auto]">
            <select className="hud-input" value={newKind} onChange={(e) => setNewKind(e.target.value as Constraint["kind"])}>
              {Object.entries(CONSTRAINT_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <select className="hud-input" value={newStrength} onChange={(e) => setNewStrength(e.target.value as Strength)}>
              {Object.entries(STRENGTH_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <input
              className="hud-input"
              disabled={!needsValue}
              placeholder={newKind === "MIN_SALARY" ? "2500" : newKind === "ONLY_REGIONS" ? "Curitiba, São José dos Pinhais" : newKind === "EXCLUDED_AREA" ? "Telemarketing" : "—"}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
            <button type="button" className="hud-btn hud-btn-ghost" onClick={addConstraint} disabled={needsValue && !newValue.trim()}>
              Adicionar
            </button>
          </div>
        </div>
      </div>
      <ErrorNote message={s.error} />
      <SaveBar
        saving={s.saving}
        saved={s.saved}
        onSave={() =>
          s.run(() =>
            api("/profile/preferences", {
              method: "PUT",
              json: {
                workModes,
                contractTypes,
                schedules,
                salaryExpectation: salary ? Number(salary) : null,
                firstJob,
                acceptsNoExperience: noExp,
                constraints,
              },
            }),
          )
        }
      />
    </Panel>
  );
}

function SkillsSection({ initial }: { initial: ProfileResponse["skills"] }) {
  const [tech, setTech] = useState(initial.filter((x) => x.kind !== "BEHAVIORAL").map((x) => x.name));
  const [soft, setSoft] = useState(initial.filter((x) => x.kind === "BEHAVIORAL").map((x) => x.name));
  const s = useSection();
  return (
    <Panel title="Competências" code="PRF-SKL">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Técnicas e ferramentas">
          <TagInput value={tech} onChange={setTech} placeholder="Ex.: Excel, SQL, React" max={60} />
        </Field>
        <Field label="Comportamentais">
          <TagInput value={soft} onChange={setSoft} placeholder="Ex.: Comunicação" max={40} />
        </Field>
      </div>
      <p className="mt-3 text-xs text-ink-faint">Liste apenas o que você consegue demonstrar. O JARVIS nunca adiciona competências que você não tem.</p>
      <ErrorNote message={s.error} />
      <SaveBar
        saving={s.saving}
        saved={s.saved}
        onSave={() =>
          s.run(() =>
            api("/profile/skills", {
              method: "PUT",
              json: { items: [...tech.map((name) => ({ name, kind: "TECHNICAL" })), ...soft.map((name) => ({ name, kind: "BEHAVIORAL" }))] },
            }),
          )
        }
      />
    </Panel>
  );
}

const emptyExperience = (): ExperienceInput => ({ company: "", title: "", kind: "JOB", location: "", startMonth: "", endMonth: "", description: "" });

function ExperienceSection({ initial }: { initial: ProfileResponse["experiences"] }) {
  const [items, setItems] = useState<ExperienceInput[]>(
    initial.map((e) => ({
      company: e.company,
      title: e.title,
      kind: e.kind,
      location: e.location,
      startMonth: e.startMonth,
      endMonth: e.endMonth,
      description: e.description,
    })),
  );
  const s = useSection();
  const update = (i: number, patch: Partial<ExperienceInput>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Panel title="Experiências e projetos" code="PRF-EXP">
      <div className="space-y-4">
        {items.map((e, i) => (
          <div key={i} className="grid gap-3 rounded border border-line p-3 sm:grid-cols-2">
            <Field label="Empresa ou projeto">
              <input className="hud-input" value={e.company} onChange={(ev) => update(i, { company: ev.target.value })} />
            </Field>
            <Field label="Cargo / papel">
              <input className="hud-input" value={e.title} onChange={(ev) => update(i, { title: ev.target.value })} />
            </Field>
            <Field label="Tipo">
              <select className="hud-input" value={e.kind} onChange={(ev) => update(i, { kind: ev.target.value as ExperienceInput["kind"] })}>
                <option value="JOB">Emprego</option>
                <option value="INTERNSHIP">Estágio</option>
                <option value="VOLUNTEER">Voluntariado</option>
                <option value="PROJECT">Projeto</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início">
                <input className="hud-input" type="month" value={e.startMonth} onChange={(ev) => update(i, { startMonth: ev.target.value })} />
              </Field>
              <Field label="Fim" hint="Vazio = atual">
                <input className="hud-input" type="month" value={e.endMonth ?? ""} onChange={(ev) => update(i, { endMonth: ev.target.value || null })} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="O que você fez">
                <textarea className="hud-input min-h-20" value={e.description ?? ""} onChange={(ev) => update(i, { description: ev.target.value })} />
              </Field>
            </div>
            <button type="button" className="hud-btn hud-btn-danger justify-self-start !py-1" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
              Remover
            </button>
          </div>
        ))}
        <button type="button" className="hud-btn hud-btn-ghost" onClick={() => setItems((xs) => [...xs, emptyExperience()])}>
          + Adicionar experiência
        </button>
      </div>
      <ErrorNote message={s.error} />
      <SaveBar
        saving={s.saving}
        saved={s.saved}
        onSave={() => s.run(() => api("/profile/experiences", { method: "PUT", json: { items: items.map((e) => ({ ...e, endMonth: e.endMonth || null })) } }))}
      />
    </Panel>
  );
}

const emptyEducation = (): EducationInput => ({ institution: "", degree: "", field: "", status: "IN_PROGRESS", startMonth: null, endMonth: null });

function EducationSection({ initial }: { initial: ProfileResponse["education"] }) {
  const [items, setItems] = useState<EducationInput[]>(
    initial.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      field: e.field,
      status: e.status,
      startMonth: e.startMonth,
      endMonth: e.endMonth,
    })),
  );
  const s = useSection();
  const update = (i: number, patch: Partial<EducationInput>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Panel title="Formação" code="PRF-EDU">
      <div className="space-y-4">
        {items.map((e, i) => (
          <div key={i} className="grid gap-3 rounded border border-line p-3 sm:grid-cols-2">
            <Field label="Instituição">
              <input className="hud-input" value={e.institution} onChange={(ev) => update(i, { institution: ev.target.value })} />
            </Field>
            <Field label="Curso / grau">
              <input className="hud-input" value={e.degree} onChange={(ev) => update(i, { degree: ev.target.value })} />
            </Field>
            <Field label="Situação">
              <select className="hud-input" value={e.status} onChange={(ev) => update(i, { status: ev.target.value as EducationInput["status"] })}>
                <option value="IN_PROGRESS">Em andamento</option>
                <option value="COMPLETED">Concluído</option>
                <option value="INCOMPLETE">Incompleto</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início">
                <input className="hud-input" type="month" value={e.startMonth ?? ""} onChange={(ev) => update(i, { startMonth: ev.target.value || null })} />
              </Field>
              <Field label="Fim">
                <input className="hud-input" type="month" value={e.endMonth ?? ""} onChange={(ev) => update(i, { endMonth: ev.target.value || null })} />
              </Field>
            </div>
            <button type="button" className="hud-btn hud-btn-danger justify-self-start !py-1" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
              Remover
            </button>
          </div>
        ))}
        <button type="button" className="hud-btn hud-btn-ghost" onClick={() => setItems((xs) => [...xs, emptyEducation()])}>
          + Adicionar formação
        </button>
      </div>
      <ErrorNote message={s.error} />
      <SaveBar saving={s.saving} saved={s.saved} onSave={() => s.run(() => api("/profile/education", { method: "PUT", json: { items } }))} />
    </Panel>
  );
}

/** Pesos do motor de compatibilidade. Precisam somar 100; o padrão é público e documentado. */
function WeightsSection({ initial }: { initial: MatchWeights | null }) {
  const [weights, setWeights] = useState<MatchWeights>(initial ?? DEFAULT_MATCH_WEIGHTS);
  const s = useSection();
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const isDefault = MATCH_CRITERIA.every((c) => weights[c.key] === c.defaultWeight);

  return (
    <Panel title="Pesos da compatibilidade" code="PRF-WGT">
      <p className="mb-4 text-sm text-ink-dim">
        Quanto cada critério pesa na nota das vagas. Ajuste para refletir o que importa para você; as notas são recalculadas ao salvar.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {MATCH_CRITERIA.map((c) => (
          <label key={c.key} className="block">
            <span className="flex items-baseline justify-between text-sm">
              <span className="text-ink">{c.label}</span>
              <span className="font-mono text-ink-dim">
                {weights[c.key]}% <span className="text-ink-faint">(padrão {c.defaultWeight})</span>
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={60}
              step={5}
              value={weights[c.key]}
              onChange={(e) => setWeights((w) => ({ ...w, [c.key]: Number(e.target.value) }))}
              className="mt-2 w-full accent-cyan"
              aria-label={`Peso de ${c.label}`}
            />
          </label>
        ))}
      </div>
      <p className={`mt-4 font-mono text-sm ${total === 100 ? "text-green" : "text-amber"}`} role="status">
        Soma: {total}% {total === 100 ? "" : `— precisa ser 100 (${total > 100 ? "tire" : "faltam"} ${Math.abs(100 - total)})`}
      </p>
      <ErrorNote message={s.error} />
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
        {s.saved && <span className="font-mono text-xs text-green">Salvo · recalculando vagas</span>}
        <button
          type="button"
          className="hud-btn hud-btn-ghost"
          disabled={s.saving || isDefault}
          onClick={() => {
            setWeights(DEFAULT_MATCH_WEIGHTS);
            void s.run(() => api("/profile/match-weights", { method: "PUT", json: { weights: null } }));
          }}
        >
          Restaurar padrão
        </button>
        <button
          type="button"
          className="hud-btn"
          disabled={s.saving || total !== 100}
          onClick={() => s.run(() => api("/profile/match-weights", { method: "PUT", json: { weights } }))}
        >
          {s.saving ? "Salvando…" : "Salvar pesos"}
        </button>
      </div>
    </Panel>
  );
}
