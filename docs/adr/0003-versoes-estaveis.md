# ADR-0003 — Fixar versões estáveis e compatíveis

- Status: aceito (2026-11-11)

## Contexto
No registry, `prisma@latest` aponta para `8.0.0-rc.33` (release candidate) e `typescript@latest` para 7.0.2 (port nativo), enquanto `@nestjs/cli@12` depende de `typescript ~6.0.2`.

## Decisão
- Prisma ORM **7.10.x** (estável), com o gerador `prisma-client`, `prisma.config.ts` e driver adapter `@prisma/adapter-pg` exigidos a partir da v7.
- TypeScript **6.0.x** em todo o monorepo.
- NestJS 12, Next.js 16, React 19, Tailwind 4, BullMQ 6, Zod 4.

## Consequências
+ Fundação sem dependências em pré-lançamento.
− Migração para Prisma 8 e TS 7 planejada quando estáveis e suportadas pelo ecossistema NestJS.
