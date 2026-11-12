# 04 — Custos e controle de consumo

## Preços de referência (Anthropic, por milhão de tokens — tabela de 2026-10)

| Modelo | ID | Entrada | Saída | Leitura de cache |
|---|---|---:|---:|---:|
| Claude Opus 5.5 | `claude-opus-5-5` | US$ 4,00 | US$ 20,00 | US$ 0,20 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | US$ 2,00 | US$ 10,00 | US$ 0,20 |
| Claude Haiku 5.5 | `claude-haiku-5-5` | US$ 0,10 | US$ 0,50 | — |

Conferir a página de preços oficial antes de qualquer decisão comercial.

## Estimativa por candidato ativo por dia (hipóteses explícitas)

| Atividade | Hipótese | Opus 5.5 em tudo | Opus no chat + Haiku em massa |
|---|---|---:|---:|
| Chat | 15 mensagens, ~2 chamadas de ferramenta cada, prefixo de 4k tokens em cache, 2k novos, 500 de saída por chamada | ~US$ 0,60 | ~US$ 0,60 |
| Análise de vagas | 200 encontradas → filtro determinístico → 30 analisadas pelo LLM (3k entrada / 800 saída) | ~US$ 0,84 | ~US$ 0,02 |
| Relatório diário | 5k entrada / 1k saída | ~US$ 0,04 | ~US$ 0,04 |
| Análise de currículo | 1 por upload (8k / 4k) — eventual | ~US$ 0,11 por análise | — |
| **Total diário típico** | | **~US$ 1,50** | **~US$ 0,66** |
| **Mensal (30 dias)** | | **~US$ 45** | **~US$ 20** |

Uma tarefa de computer use de ~30 passos (screenshots ~1,5k tokens cada) custa na ordem de US$ 0,30–0,40 no Opus 5.5 — por isso o Action Router só escolhe Computer Use quando API e Playwright não resolvem.

O roteamento para um modelo mais barato é decisão de produto: o padrão é Opus 5.5 em todas as rotas até que uma avaliação mostre que a rota de massa mantém qualidade com outro modelo.

## Outros custos (a cotar — não estimados para não inventar valores)

- Browserbase (sessões remotas): conferir plano vigente em browserbase.com.
- Voz: LiveKit Cloud + STT + TTS cobram por minuto; cotar na Fase 7.
- Infraestrutura: Postgres e Redis gerenciados, armazenamento de objetos, containers de automação.

## Controles implementados / planejados

| Controle | Fase |
|---|---|
| `UsageRecord` por chamada de LLM (modelo, tokens de entrada/saída/cache, custo calculado, candidato, rota) | 2 |
| Orçamento diário por candidato com pausa automática ao atingir o teto | 2 |
| Limites diários de pesquisas e de candidaturas por candidato e por plataforma | 3 / 5 |
| Limite de sessões de navegador simultâneas e de duração por sessão | 4 |
| Concorrência por fila no BullMQ | 1 (estrutura) / 8 |
| Alertas de consumo no painel admin | 9 |
| Filtros determinísticos antes de qualquer chamada de LLM (eliminatórios, deduplicação) | 3 |
| Cache de prompt (system + ferramentas estáveis) | 2 |
