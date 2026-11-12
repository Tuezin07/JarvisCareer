"use client";

import { useEffect, useMemo, useRef } from "react";
import type { AgentState } from "@jarvis/shared";


interface Look {
  accent: string;
  /** Multiplicador de velocidade das camadas giratórias. */
  speed: number;
  sweep: boolean;
  orbit: boolean;
}

const LOOK: Record<AgentState, Look> = {
  idle: { accent: "var(--cyan)", speed: 1, sweep: false, orbit: false },
  listening: { accent: "var(--cyan)", speed: 1.4, sweep: false, orbit: false },
  thinking: { accent: "#7cc8ff", speed: 3.4, sweep: false, orbit: true },
  researching: { accent: "var(--cyan)", speed: 2.2, sweep: true, orbit: false },
  analyzing: { accent: "#5ff5e0", speed: 2.4, sweep: true, orbit: false },
  executing: { accent: "var(--blue)", speed: 3, sweep: false, orbit: true },
  waiting_approval: { accent: "var(--amber)", speed: 0.5, sweep: false, orbit: false },
  error: { accent: "var(--red)", speed: 0.3, sweep: false, orbit: false },
  completed: { accent: "var(--green)", speed: 1, sweep: false, orbit: false },
};

const R = 200;
/** Arredonda para 3 casas: Node e navegador divergem na última casa da trigonometria (hidratação). */
const round = (n: number) => Math.round(n * 1000) / 1000;
const polar = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [round(r * Math.cos(a)), round(r * Math.sin(a))] as const;
};

/** Arco SVG entre dois ângulos (graus, 0 = topo). */
function arc(r: number, from: number, to: number) {
  const [x1, y1] = polar(r, from);
  const [x2, y2] = polar(r, to);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

export function JarvisCore({
  state,
  pulse = 0,
  label,
}: {
  state: AgentState;
  /** Muda a cada evento ao vivo: dispara a onda de choque. */
  pulse?: number;
  label?: string;
}) {
  const look = LOOK[state];
  const rootRef = useRef<HTMLDivElement>(null);

  // Ajusta a velocidade sem reiniciar as animações (sem saltos de rotação).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    for (const anim of el.getAnimations({ subtree: true })) {
      const name = (anim as CSSAnimation).animationName ?? "";
      if (name.includes("spin")) anim.updatePlaybackRate(look.speed);
    }
  }, [look.speed]);

  const ticks = useMemo(
    () =>
      Array.from({ length: 120 }, (_, i) => {
        const long = i % 10 === 0;
        const [x1, y1] = polar(190, i * 3);
        const [x2, y2] = polar(long ? 178 : 184, i * 3);
        return { x1, y1, x2, y2, long };
      }),
    [],
  );

  const bars = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        deg: i * 7.5,
        h: 6 + ((i * 37) % 11),
        delay: ((i * 53) % 9) * 0.1,
      })),
    [],
  );

  return (
    <div
      ref={rootRef}
      className="jc-root"
      style={{ ["--accent" as string]: look.accent }}
      data-state={state}
      data-sweep={look.sweep}
      data-orbit={look.orbit}
      role="img"
      aria-label={`Núcleo do JARVIS — ${label ?? state}`}
    >
      <svg className="jc-svg" viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`} aria-hidden>
        <defs>
          <radialGradient id="core-orb" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="28%" stopColor="currentColor" stopOpacity="0.85" />
            <stop offset="70%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="core-haze" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="core-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.38" />
          </linearGradient>
          <filter id="core-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <path id="core-text-ring" d={`M 0 -197 A 197 197 0 1 1 -0.01 -197`} />
        </defs>

        <circle r="198" fill="url(#core-haze)" />

        {/* Anel externo de telemetria com texto orbital */}
        <g className="jc-spin" style={{ ["--d" as string]: "140s" }}>
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke="currentColor"
              strokeOpacity={t.long ? 0.85 : 0.35}
              strokeWidth={t.long ? 1.6 : 0.8}
            />
          ))}
          <text fontSize="6.5" letterSpacing="3.2" fill="currentColor" fillOpacity="0.55" fontFamily="var(--font-geist-mono)">
            <textPath href="#core-text-ring">
              JARVIS CAREER · INTELLIGENCE CORE · RECOLOCAÇÃO PROFISSIONAL · SISTEMA ATIVO · J-01 ·
            </textPath>
          </text>
        </g>

        {/* Anel de aprovação pendente */}
        <circle className="jc-approval" r="186" fill="none" stroke="var(--amber)" strokeWidth="2" strokeDasharray="14 8" />

        {/* Segmentos de arco. O filtro fica num <g> interno: no Chromium, filtro e
            transform CSS no mesmo elemento deslocam o centro de rotação. */}
        <g className="jc-spin-rev" style={{ ["--d" as string]: "48s" }}>
          <g filter="url(#core-glow)">
            <path d={arc(168, 8, 62)} stroke="currentColor" strokeWidth="3" fill="none" strokeOpacity="0.9" />
            <path d={arc(168, 70, 84)} stroke="currentColor" strokeWidth="3" fill="none" strokeOpacity="0.5" />
            <path d={arc(168, 128, 196)} stroke="currentColor" strokeWidth="3" fill="none" strokeOpacity="0.9" />
            <path d={arc(168, 204, 214)} stroke="currentColor" strokeWidth="3" fill="none" strokeOpacity="0.5" />
            <path d={arc(168, 252, 330)} stroke="currentColor" strokeWidth="3" fill="none" strokeOpacity="0.9" />
          </g>
        </g>

        {/* Colchetes cardeais */}
        <g className="jc-spin" style={{ ["--d" as string]: "90s" }}>
          <circle r="152" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="0.8" />
          {[0, 90, 180, 270].map((d) => (
            <path key={d} d={arc(152, d - 9, d + 9)} stroke="currentColor" strokeWidth="2" fill="none" />
          ))}
        </g>

        {/* Varredura de dados (pesquisa / análise) */}
        <g className="jc-sweep">
          <path d={`M 0 0 L ${polar(150, 0).join(" ")} ${arc(150, 0, 48).replace(/^M [^A]+/, "")} Z`} fill="url(#core-sweep)" />
          <line x1="0" y1="0" x2={polar(150, 48)[0]} y2={polar(150, 48)[1]} stroke="currentColor" strokeWidth="1.2" />
        </g>

        {/* Anel pontilhado */}
        <g className="jc-spin" style={{ ["--d" as string]: "26s" }}>
          <circle r="132" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.4" strokeDasharray="1.5 6" />
        </g>

        {/* Barras radiais: a rotação fica no <g>, a escala (CSS) no <rect>,
            porque o transform do CSS substituiria o atributo transform do SVG. */}
        <g>
          {bars.map((b, i) => (
            <g key={i} transform={`rotate(${b.deg})`}>
              <rect
                className="jc-bar"
                x={-1}
                y={-104 - b.h}
                width="2"
                height={b.h}
                fill="currentColor"
                fillOpacity="0.75"
                style={{ animationDelay: `${b.delay}s` }}
              />
            </g>
          ))}
        </g>

        {/* Órbitas de processamento */}
        <g className="jc-orbit">
          {[0, 120, 240].map((d) => {
            const [x, y] = polar(118, d);
            return <circle key={d} cx={x} cy={y} r="3.2" fill="currentColor" filter="url(#core-glow)" />;
          })}
        </g>

        {/* Anel interno de processamento */}
        <g className="jc-spin" style={{ ["--d" as string]: "12s" }}>
          <g filter="url(#core-glow)">
            <path d={arc(84, 0, 110)} stroke="currentColor" strokeWidth="4" fill="none" />
            <path d={arc(84, 180, 290)} stroke="currentColor" strokeWidth="4" fill="none" />
          </g>
        </g>
        <circle r="74" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />

        {/* Núcleo */}
        <g className="jc-breathe">
          <circle r="60" fill="url(#core-orb)" />
          <circle r="34" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.2" />
        </g>

        {pulse > 0 && (
          <circle key={pulse} className="jc-shock" r="190" fill="none" stroke="currentColor" strokeWidth="2" />
        )}
        {state === "completed" && (
          <circle key="done" className="jc-shock" r="190" fill="none" stroke="var(--green)" strokeWidth="3" />
        )}
      </svg>
    </div>
  );
}
