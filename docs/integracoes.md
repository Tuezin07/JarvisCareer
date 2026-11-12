# Inventário de integrações

Duas listas separadas de propósito: o que o **Claude Code usa para construir** o JARVIS e o que o **JARVIS usa em produção**. Uma ferramenta MCP instalada no ambiente de desenvolvimento **não** fica disponível no produto.

## A. Ambiente de desenvolvimento (Claude Code)

| Nome | Tipo | Origem | Versão | Responsabilidade | Permissões | Variáveis | Custo | Instalação | Funcionamento |
|---|---|---|---|---|---|---|---|---|---|
| Playwright MCP | MCP stdio | github.com/microsoft/playwright-mcp (oficial Microsoft) | `@playwright/mcp@latest` | Navegar, inspecionar e testar a interface do JARVIS | Navegador local controlado pelo Claude Code | — | Gratuito (Apache-2.0) | `.mcp.json` (projeto) | Carrega ao reabrir a sessão; aprovar o servidor de projeto quando solicitado |
| Browserbase MCP | MCP HTTP hospedado | docs.stagehand.dev (oficial Browserbase) | hospedado | Navegador remoto + `act`/`observe`/`extract` | Sessões na conta Browserbase do usuário | `BROWSERBASE_API_KEY` | Plano Browserbase | `.mcp.json` (projeto) | **Aguardando chave** |
| Navegador embutido do app | Ferramenta do app | Claude desktop | — | Verificação visual da interface | Local | — | — | Nativo | Ativo |

Avaliados e **não instalados** por ora (instalar só quando a fase precisar): Context7 (documentação — útil já na Fase 2), GitHub MCP (quando houver repositório remoto), Chrome DevTools MCP (Fase 7, desempenho), Serena (quando o código crescer), n8n MCP (notificações periféricas, Fase 8). Supabase não será usado: PostgreSQL + Prisma + NestJS atendem.

### Configurar a chave do Browserbase

O `.mcp.json` lê `${BROWSERBASE_API_KEY}` do ambiente; a chave nunca é gravada no repositório. No PowerShell (persistente para o usuário):

```powershell
[Environment]::SetEnvironmentVariable("BROWSERBASE_API_KEY", "<sua-chave>", "User")
```

Depois, reinicie o app/sessão do Claude Code e confirme com `/mcp`.

## B. Produção (dependências do JARVIS)

| Nome | Tipo | Responsabilidade | Variáveis | Fase | Status |
|---|---|---|---|---|---|
| PostgreSQL 17 | Banco | Dados de domínio | `DATABASE_URL` | 1 | Testado (e2e) |
| Prisma ORM 7.10 + `@prisma/adapter-pg` | ORM | Acesso tipado, migrações | `DATABASE_URL` | 1 | Testado (e2e) |
| Redis 7.4 + BullMQ 6 | Filas | Jobs, estado do núcleo (pub/sub) | `REDIS_URL` | 1 | Testado (e2e) |
| Armazenamento de arquivos | Storage | Currículos, evidências | `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR` | 1 | Driver local implementado; driver S3 planejado |
| Anthropic API (`@anthropic-ai/sdk`) | LLM | Cérebro, análise, computer use | `ANTHROPIC_API_KEY` | 2 | Planejado — requer chave |
| Greenhouse / Lever / Ashby (leitura) | APIs públicas | Descoberta de vagas | — | 3 | Planejado |
| Playwright | Navegador | Executor determinístico | — | 4 | Planejado |
| Stagehand / Browserbase | Navegador adaptativo/remoto | Executor adaptativo | `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | 4 | Planejado — requer conta |
| LiveKit Agents + STT/TTS | Voz | Conversa por voz | a definir | 7 | Planejado |
| E-mail transacional | Notificação | Alertas e relatórios | a definir | 8 | Planejado |
| OpenTelemetry / Sentry | Observabilidade | Traces, erros | a definir | 9 | Planejado |
