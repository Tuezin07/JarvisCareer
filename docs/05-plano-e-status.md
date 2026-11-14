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

## Fase 2 — Inteligência (2026-11-12)

| Funcionalidade | Status | Evidência |
|---|---|---|
| `LlmProvider` + `AnthropicProvider` (Opus 5.5, thinking adaptativo, `effort`, streaming, fallback de recusa no servidor, cache de prompt) | Implementada | tipos verificados contra o SDK 1.8; chamada real chegou à API (recusada: conta sem créditos) |
| Chat com streaming (POST → text/event-stream), histórico append-only, conversas por candidato | Testada | e2e "responde usando dados reais…", tela `/conversa` verificada no navegador |
| Action Router: validação Zod, política por risco, limite diário, timeout, `ActionExecution`, auditoria | Testada | e2e "entrada inválida e ferramenta inexistente…", "atualiza preferências…" |
| Ferramentas: perfil, estatísticas, histórico de atividades, currículos (lista, texto, análise), análise sob demanda, preferências, pausar/retomar, memória (guardar, consultar, esquecer) | Testada (via provedor falso) | e2e de conversa; `get_activity_history`, `update_candidate_preferences`, `save_memory` exercitadas |
| Memória estruturada (`AgentMemory`) | Testada | e2e "guarda e recupera memórias" |
| Custo por chamada (`UsageRecord`) e orçamento de 24 h por candidato | Testada | unitários `costMicroUsd`; e2e "orçamento diário estourado…" (429) |
| Uma resposta por vez por conversa (lock no Redis) | Testada | e2e "uma resposta por vez…" |
| Análise de currículo no worker com saída estruturada e nota determinística por 6 critérios públicos | Testada (via provedor falso) | e2e "worker analisa com o provedor…" (nota 60 conferida pelos pesos) |
| Relatório de análise na interface | Implementada | verificado no navegador com dado de teste rotulado (removido em seguida) |
| Mensagens de erro do provedor sem vazar detalhes | Testada | interface mostra aviso de créditos; e2e de 503 sem chave |
| **Respostas reais do modelo** | **Bloqueada** | conta Anthropic sem créditos — adicionar créditos e repetir o teste real |
| Variantes de currículo por área (`generate_resume_variant`), carta de apresentação | Planejada | próxima entrega da Fase 2 |
| Extração do perfil a partir do currículo com confirmação do candidato | Planejada | próxima entrega da Fase 2 |
| Compactação de conversas longas | Planejada | ADR-0008 |

**Totais:** 55 testes automatizados (7 contratos, 25 unitários, 23 e2e com Postgres/Redis reais).

## Fase 3 — Pesquisa de vagas (2026-11-12)

| Funcionalidade | Status | Evidência |
|---|---|---|
| Conectores de leitura Greenhouse, Lever e Ashby (APIs públicas oficiais, allowlist de hosts) | Testada | unitários com respostas no formato real; **verificado ao vivo** com a página pública da Stone (Greenhouse, 347 vagas) |
| Acompanhar empresa por link; importar vaga específica por link | Testada | e2e "acompanha uma empresa…", "importa uma vaga específica…"; links de LinkedIn/Gupy recusados |
| Sincronização no worker: agendada a cada 6 h, sob demanda, trava por empresa, encerramento de vagas que somem, circuit breaker | Testada | e2e "vaga que some da página é encerrada…"; respeita pausa (e2e "com as operações pausadas…") |
| Normalização e deduplicação (hash de conteúdo; chave empresa+cargo+local) | Testada | unitários de `contentHash`/`dedupKey` |
| Motor de compatibilidade determinístico, 7 critérios, pesos configuráveis, restrições eliminatórias/importantes/flexíveis, perguntas para dados ausentes | Testada | 15 unitários do motor; e2e "mudança de preferências recalcula…" |
| Recálculo automático quando perfil/preferências mudam | Testada | e2e |
| Sinais de fraude com evidência | Testada | unitários `detectFraudSignals` |
| Ferramentas do agente: `search_jobs`, `get_job_details`, `compare_jobs`, `list_job_sources`, `follow_company_jobs`, `refresh_job_search`, `set_job_status` | Testada (via provedor falso) | e2e "search_jobs devolve vagas reais…" |
| Tela de Vagas (empresas, filtros, lista, detalhe com explicação, salvar/descartar, link oficial) | Implementada | verificada no navegador com dados reais |
| Isolamento: lista e detalhe por candidato; fonte compartilhada, compatibilidade não | Testada | e2e "cada candidato tem sua própria lista…" |
| Portais sem API autorizada (LinkedIn, Gupy, Catho, Indeed…) | Fora do escopo | matriz de plataformas (nível D/E) |
| Análise semântica da vaga por IA (complementar à nota) | Planejada | depende de créditos na conta Anthropic |
| UI para editar os pesos da compatibilidade | Planejada | API e armazenamento prontos (`matchWeights`) |

**Totais:** 90 testes automatizados (7 contratos, 51 unitários, 32 e2e com Postgres/Redis reais).

## Próximas fases

| Fase | Entrega | Depende de |
|---|---|---|
| 2b — Inteligência (restante) | Variantes de currículo sem invenção, carta de apresentação, extração de perfil a partir do currículo com confirmação | créditos na conta Anthropic |
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
