import { HudFrame } from "@/components/HudFrame";

/**
 * A sessão pertence à API (cookies httpOnly) e é validada no cliente antes de renderizar
 * as páginas; não há shell estático a pré-validar para navegação instantânea.
 */
export const instant = false;

export default function HudLayout({ children }: { children: React.ReactNode }) {
  return <HudFrame>{children}</HudFrame>;
}
