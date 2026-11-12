import type { Metadata } from "next";
import View from "./view";

export const metadata: Metadata = { title: "Atividade" };

/** Conteúdo autenticado, renderizado no cliente após validar a sessão (ver (hud)/layout.tsx). */
export const instant = false;

export default function Page() {
  return <View />;
}
