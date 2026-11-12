# ADR-0002 — Monorepo com npm workspaces

- Status: aceito (2026-11-11)

## Contexto
API, web e contratos compartilhados evoluem juntos. A máquina tem npm 11; pnpm não está instalado e habilitá-lo via corepack exige escrita no diretório do Node.

## Decisão
Monorepo com npm workspaces (`apps/*`, `packages/*`). Sem Turborepo/Nx por enquanto: os scripts raiz delegam com `--workspace`.

## Consequências
+ Zero instalação adicional; um único lockfile.
− Instalação mais lenta que pnpm. Reavaliar se o número de pacotes crescer.
