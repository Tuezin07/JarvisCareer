# 00 — Diagnóstico do ambiente

Levantamento feito em 2026-11-11, antes de qualquer arquivo ser criado. O diretório `JarvisCareer` estava **vazio** (sem repositório git, sem código prévio), então nada foi sobrescrito.

## Máquina de desenvolvimento

| Item | Encontrado | Observação |
|---|---|---|
| Sistema operacional | Windows 11 Pro 10.0.26200 | Shells: PowerShell 5.1 e Git Bash |
| CPU / RAM | AMD Ryzen 5 5600G / 15,3 GB | Suficiente para Postgres + Redis + API + Web + 1 navegador headless. Desktop VM (Fase 6) deve rodar fora desta máquina. |
| Node.js | 24.14.0 | Atende NestJS 12 (`>=20.11`), Next 16 (`>=20.9`), Prisma 7 (`>=20.19`) |
| npm | 11.12.1 | Usado com *workspaces* (ver ADR-0002) |
| pnpm / yarn / bun | ausentes | `corepack` 0.34.6 disponível, mas não habilitado |
| Git | 2.53.0 | Repositório inicializado nesta fase |
| Docker | Docker Desktop 29.6.2 + Compose v5.3.1 | Em execução |
| Python | 3.14.3 | Não é dependência do produto; útil para ferramentas pontuais |
| PostgreSQL local | **processo `postgres` já escutando em 5432** | Para não colidir, o Postgres do projeto roda em container na porta **5433** |
| Redis local | ausente | Redis do projeto roda em container na porta **6380** |
| Claude CLI no PATH | ausente | O app desktop usa binário embutido; MCPs foram configurados via `.mcp.json` (escopo de projeto) |

## Versões estáveis consultadas no registry npm (2026-11-11)

| Pacote | Última | Decisão |
|---|---|---|
| `@nestjs/core` / `@nestjs/cli` | 12.4.2 / 12.0.12 | **12.x** |
| `typescript` | 7.0.2 | **6.0.x** — o `@nestjs/cli` 12 depende de `typescript ~6.0.2`; TS 7 (port nativo) fica para depois |
| `prisma` / `@prisma/client` | `latest` = 8.0.0-rc.33 (RC) / 7.10.1 | **7.10.x** — não usar release candidate na fundação |
| `next` / `react` | 16.4.6 / 19.3.1 | **16.x / 19.x** |
| `tailwindcss` | 4.3.5 | **4.x** |
| `bullmq` / `ioredis` | 6.7.5 / 6.0.0 | **6.x** (`@nestjs/bullmq` 12 aceita bullmq ^6) |
| `zod` | 4.6.7 | **4.x** (contratos compartilhados) |
| `@anthropic-ai/sdk` | 1.8.0 | Fase 2 |
| `playwright` | 1.65.0 | Fase 4 |
| `@browserbasehq/stagehand` | 4.4.0 | Fase 4 |

## Ferramentas MCP do ambiente de desenvolvimento

| MCP | Estado | Como |
|---|---|---|
| Playwright MCP (`@playwright/mcp`) | Configurado | `.mcp.json` → `cmd /c npx -y @playwright/mcp@latest` (no Windows nativo o `npx` precisa do wrapper `cmd /c`) |
| Browserbase MCP hospedado | Configurado, **aguardando chave** | `.mcp.json` → `https://mcp.browserbase.com/mcp` com `Authorization: Bearer ${BROWSERBASE_API_KEY}` |
| Claude in Chrome / navegador embutido | Disponíveis na sessão | Usados para verificar a interface |

> Os MCPs acima servem ao **desenvolvimento** (Claude Code). Nada disso fica disponível ao JARVIS em produção — ver [integracoes.md](integracoes.md).

## Variáveis e infraestrutura

- Nenhum `.env` existia. Foi criado `.env.example` (versionado) e `.env` local (ignorado pelo git).
- Nenhuma conta cloud, chave de IA ou serviço externo foi configurado. Itens que dependem de conta real (Anthropic, Browserbase, provedores de voz, e-mail) estão marcados como **pendentes de autorização/credencial** no plano.
