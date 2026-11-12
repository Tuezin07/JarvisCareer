import { JarvisCore } from "@/components/JarvisCore";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-[1fr_440px]">
      <div className="hidden flex-col items-center gap-6 lg:flex">
        <div className="w-full max-w-[460px]">
          <JarvisCore state="idle" />
        </div>
        <div className="text-center">
          <p className="hud-title text-2xl font-semibold tracking-[0.3em] text-ink">
            JARVIS<span className="text-cyan">·</span>CAREER
          </p>
          <p className="mt-2 max-w-sm text-sm text-ink-dim">
            Seu assistente de recolocação: entende seu currículo, pesquisa oportunidades e mostra, com evidências, tudo o que fez.
          </p>
        </div>
      </div>
      <div className="w-full">{children}</div>
    </div>
  );
}
