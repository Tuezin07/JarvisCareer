# Inventário de integrações

Duas listas separadas de propósito: o que o **Claude Code usa para construir** o JARVIS e o que o **JARVIS usa em produção**. Uma ferramenta MCP instalada no ambiente de desenvolvimento **não** fica disponível no produto.

## A. Ambiente de desenvolvimento (Claude Code)

| Nome | Tipo | Origem | Versão | Responsabilidade | Permissões | Variáveis | Custo | Instalação | Funcionamento |
|---|---|---|---|---|---|---|---|---|---|
| Playwright MCP | MCP stdio | github.com/microsoft/playwright-mcp (oficial Microsoft) | `@playwright/mcp@latest` | Navegar, inspecionar e testar a interface do JARVIS | Navegador local controlado pelo Claude Code | — | Gratuito (Apache-2.0) | `.mcp.json` (projeto) | Conectado (ferramentas carregadas em 2026-11-12) |
| Browserbase MCP | MCP HTTP hospedado | docs.stagehand.dev (oficial Browserbase) | hospedado | Navegador remoto + `act`/`observe`/`extract` | Sessões na conta Browserbase do usuário | `BROWSERBASE_API_KEY` | Plano Browserbase | `.mcp.json` (projeto) | **Funcionando** (2026-11-12): `start` → `navigate` (example.com, 200) → `extract` → `end` |
| Navegador embutido do app | Ferramenta do app | Claude desktop | — | Verificação visual da interface | Local | — | — | Nativo | Ativo |

Avaliados e **não instalados** por ora (instalar só quando a fase precisar): Context7 (documentação — útil já na Fase 2), GitHub MCP (quando houver repositório remoto), Chrome DevTools MCP (Fase 7, desempenho), Serena (quando o código crescer), n8n MCP (notificações periféricas, Fase 8). Supabase não será usado: PostgreSQL + Prisma + NestJS atendem.

### Configurar a chave do Browserbase

O `.mcp.json` lê `${BROWSERBASE_API_KEY}` do ambiente; a chave nunca é gravada no repositório. No PowerShell (persistente para o usuário):

```powershell
[Environment]::SetEnvironmentVariable("BROWSERBASE_API_KEY", "COLE_A_CHAVE_AQUI", "User")
```

Substitua `COLE_A_CHAVE_AQUI` pela chave exatamente como o painel do Browserbase mostra (começa com `bb_`), só entre as aspas, sem `<` `>` nem espaços. Depois, reinicie o app do Claude e confirme com `/mcp`.

> **Nota para a Fase 4:** o retorno de `navigate` no Browserbase/Stagehand inclui objetos internos da conexão, entre eles a URL CDP da sessão com uma chave de assinatura temporária. No JARVIS WEB, resultados brutos dessas chamadas nunca vão para logs, `ActionEvidence` ou para o modelo sem redação — só URL final, status, texto extraído e screenshots.

## B. Produção (dependências do JARVIS)

| Nome | Tipo | Responsabilidade | Variáveis | Fase | Status |
|---|---|---|---|---|---|
| PostgreSQL 17 | Banco | Dados de domínio | `DATABASE_URL` | 1 | Testado (e2e) |
| Prisma ORM 7.10 + `@prisma/adapter-pg` | ORM | Acesso tipado, migrações | `DATABASE_URL` | 1 | Testado (e2e) |
| Redis 7.4 + BullMQ 6 | Filas | Jobs, estado do núcleo (pub/sub) | `REDIS_URL` | 1 | Testado (e2e) |
| Armazenamento de arquivos | Storage | Currículos, evidências | `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR` | 1 | Driver local implementado; driver S3 planejado |
| Anthropic API (`@anthropic-ai/sdk` 1.8) | LLM | Chat com ferramentas, análise de currículo (computer use na Fase 6) | `ANTHROPIC_API_KEY`, `LLM_MODEL_PRIMARY`, `LLM_DAILY_BUDGET_USD` | 2 | Implementado; testado com provedor falso; chamada real chegou à API e foi recusada por **falta de créditos na conta** |
| Greenhouse / Lever / Ashby (leitura) | APIs públicas oficiais | Descoberta de vagas por empresa | — | 3 | **Testado**; Greenhouse verificado ao vivo (Stone, 347 vagas) |
| Playwright 1.65 (Chromium) | Navegador | Executor determinístico do JARVIS WEB (`apps/automation`) | `BROWSER_PROVIDER=local` | 4 | **Testado** (executor real contra site de testes; inspeção real de vaga Greenhouse verificada) |
| Browserbase (`@browserbasehq/sdk` 2.27) | Navegador remoto | Provedor alternativo do executor (CDP) | `BROWSER_PROVIDER=browserbase`, `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | 4 | Implementado; **não verificado pelo executor** (consome minutos da conta) — o MCP já foi verificado |
| Stagehand | Navegador adaptativo | Executor adaptativo (`act`/`observe`/`extract`) | chave de LLM | 4 | Planejado — depende de créditos de IA |
| LiveKit Agents + STT/TTS | Voz | Conversa por voz | a definir | 7 | Planejado |
| E-mail transacional | Notificação | Alertas e relatórios | a definir | 8 | Planejado |
| OpenTelemetry / Sentry | Observabilidade | Traces, erros | a definir | 9 | Planejado |
