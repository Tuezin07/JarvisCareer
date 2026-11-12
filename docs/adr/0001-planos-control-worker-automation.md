# ADR-0001 — Separar control plane, workers e automation plane

- Status: aceito (2026-11-11)

## Contexto
O JARVIS executa trabalho de longa duração (pesquisa, análise) e automação sobre conteúdo não confiável (navegador, desktop). A arquitetura de referência aprovada pelo usuário determina que a API principal não execute cliques, downloads ou navegação no mesmo processo que atende os clientes.

## Decisão
- `apps/api` tem dois entrypoints do mesmo código NestJS: `main.ts` (HTTP + SSE) e `worker.ts` (processadores BullMQ, sem HTTP).
- `apps/automation` (Fase 4) é um serviço separado, executado em container efêmero por sessão de candidato, sem acesso ao banco; recebe jobs pela fila e devolve resultados + evidências.

## Consequências
+ Falha ou comprometimento de uma sessão de navegador não afeta a API nem outros candidatos.
+ Escala independente de HTTP, workers e automação.
− Mais um serviço para implantar; contratos de job precisam ser versionados (`packages/shared`).
