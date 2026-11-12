import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_TEXT_VERSION } from "@jarvis/shared";

export const metadata: Metadata = { title: "Termos e privacidade" };

export default function LegalPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/login" className="text-sm text-cyan hover:underline">
        ← Voltar
      </Link>
      <div className="hud-panel mt-4 space-y-6 p-6 text-[15px] leading-relaxed text-ink-dim sm:p-8">
        <div className="rounded border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
          Versão preliminar ({LEGAL_TEXT_VERSION}) para o ambiente de desenvolvimento. O texto definitivo depende de validação
          jurídica antes de qualquer uso comercial.
        </div>

        <section>
          <h1 className="hud-title text-2xl font-semibold text-ink">Termos de uso</h1>
          <p className="mt-3">
            O JARVIS Career auxilia na busca de emprego: organiza seu perfil, lê seus currículos e, em fases futuras, pesquisa vagas
            e prepara candidaturas. O serviço não garante contratação. Nenhuma candidatura é enviada sem a sua autorização expressa,
            que pode ser revogada a qualquer momento.
          </p>
        </section>

        <section id="privacidade">
          <h2 className="hud-title text-xl font-semibold text-ink">Política de privacidade</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>Coletamos os dados que você informa (perfil, preferências) e os currículos que você envia.</li>
            <li>Usamos esses dados apenas para a sua busca de emprego. Não vendemos nem compartilhamos com terceiros para publicidade.</li>
            <li>Não pedimos nem inferimos dados sensíveis (origem, religião, saúde, orientação, etc.), e eles nunca entram no cálculo de compatibilidade.</li>
            <li>Senhas são guardadas apenas como hash (Argon2id). Arquivos ficam em armazenamento privado.</li>
            <li>Você pode exportar todos os seus dados e excluir sua conta, com os arquivos, a qualquer momento em “Privacidade”.</li>
            <li>Registramos ações relevantes (acessos, envios, exclusões) em trilha de auditoria, sem o conteúdo dos documentos.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
