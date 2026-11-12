# 05 — Plano de implementação e status

Classificação: **Planejada** → **Implementada** → **Testada** → **Em produção**. Nada está em produção.

## Fase 0 — Pesquisa técnica ✅

Diagnóstico, arquitetura, estratégias, segurança/LGPD, custos, matriz de plataformas, inventário de integrações e ADRs 0001–0007 em `docs/`.

## Fase 1 — Fundação ✅ (2026-11-11)

| Funcionalidade | Status | Evidência |
|---|---|---|
| Monorepo, Docker (Postgres 17, Redis 7.4) | Testada | `infra/docker-compose.yml`; healthcheck `GET /api/health` |
| Modelo de dados Fase 1 + migração versionada | Testada | `apps/api/prisma/` |
| Cadastro, login, logout, `me` | Testada | e2e "autenticação" |
| Sessão httpOnly + refresh rotativo + detecção de reuso | Testada | e2e "refresh rotaciona…", "reapresentar um refresh já usado…" |
| Rate limit (global e por rota sensível) | Implementada | desligado em `NODE_ENV=test`; teste dedicado pendente |
| Perfil, preferências, restrições (eliminatório/importante/flexível), competências, experiências, formação | Testada | e2e "perfil e dashboard"; unitários de schema |
| Upload de currículo (PDF/DOCX/TXT) com validação por conteúdo, hash, duplicidade, limite 5 MB | Testada | e2e "recusa arquivo disfarçado…"; unitários `file-signature` |
| Extração de texto em worker separado via BullMQ (retentativa exponencial, timeout, erro irrecuperável) | Testada | e2e "upload de PDF é processado pelo worker…"; unitários `text-extractor` |
| DOCX: extração | Implementada | coberta só por detecção de tipo; teste com DOCX real pendente |
| `.doc` legado, OCR de PDF escaneado | Planejada | hoje: mensagem orientando o formato / aviso de pouco texto |
| Linha do tempo (`AgentEvent`) + estado do núcleo via Redis pub/sub + SSE | Testada | e2e (eventos e estado); SSE verificado manualmente com `curl -N` e na interface |
| `AgentTask` espelhando jobs (idempotência por jobId) | Testada | e2e verifica `SUCCEEDED` |
| Isolamento entre candidatos | Testada | e2e "um candidato não lê, altera nem apaga dados de outro" |
| LGPD: consentimentos versionados, exportação, exclusão com arquivos | Testada | e2e "privacidade (LGPD)" |
| Auditoria com redação de campos sensíveis | Testada | unitário `redact`; e2e verifica `account.deleted` e `auth.refresh_reuse_detected` |
| Storage local com proteção contra path traversal | Testada | unitários `StorageService` |
| Storage S3 | Planejada | ADR-0005 |
| Interface: login, cadastro, central de comando, perfil, currículos, atividade, privacidade | Implementada | verificada manualmente no navegador (desktop 1280px e mobile 375px), build de produção OK |
| Núcleo animado ligado ao estado real (SSE) | Implementada | verificado: idle → analyzing → completed durante upload real |
| Testes automatizados de interface (Playwright) | Planejada | Fase 4 traz o Playwright ao projeto |

**Totais:** 37 testes automatizados (7 contratos, 18 unitários da API, 12 e2e com Postgres/Redis reais).

## Próximas fases

| Fase | Entrega | Depende de |
|---|---|---|
| 2 — Inteligência | `LlmProvider` (Anthropic SDK), chat com streaming e histórico, ferramentas tipadas com Action Router, memória estruturada, análise de currículo com saída estruturada e pontuação explicada, variantes de currículo sem invenção, `UsageRecord` + orçamento por candidato | **`ANTHROPIC_API_KEY`** |
| 3 — Pesquisa | Conectores oficiais Greenhouse/Lever/Ashby (leitura), normalização, deduplicação, motor de compatibilidade com pesos configuráveis, detecção de fraude, vaga por link colado | lista de empresas/board tokens |
| 4 — JARVIS WEB | `apps/automation` isolado, Playwright + Stagehand, allowlist, evidências (screenshots com retenção), sessões por candidato | conta Browserbase (opcional) |
| 5 — Candidaturas | Estados completos, modos assistido/semiautônomo/autônomo com limites, nível D por padrão | revisão de termos por plataforma |
| 6 — JARVIS DESKTOP | VM/container com Computer Use (`computer_toolset_20260801`), Desktop Companion (Tauri, pareamento, kill switch) | ambiente de VM |
| 7 — Voz e interface | LiveKit Agents, STT/TTS com voz original, visualizador de áudio no núcleo | contas de voz |
| 8 — Autonomia | Job Schedulers, relatórios diário/semanal, notificações, circuit breaker | — |
| 9 — Produção | Observabilidade (OpenTelemetry/Sentry), backups, deploy, revisão de segurança, validação jurídica LGPD | escolha de cloud |

## Problemas conhecidos

- Rate limiter usa armazenamento em memória (um processo). Com várias instâncias da API, migrar para Redis.
- `npm audit` aponta 1 vulnerabilidade moderada em dependência de **desenvolvimento** (`minimatch` via ESLint); produção sem vulnerabilidades conhecidas.
- O texto legal é preliminar e precisa de revisão jurídica.
