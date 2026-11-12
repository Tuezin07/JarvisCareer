# ADR-0008 — Intelligence Core: loop manual, histórico append-only e Action Router

- Status: aceito (2026-11-12)

## Contexto
O JARVIS precisa conversar, chamar ferramentas reais e explicar o que fez, sem que o modelo decida permissões. A API atual da Anthropic (Opus 5.5) tem particularidades: thinking sempre ativo (profundidade por `effort`), `tool_choice` forçado proibido, blocos de thinking vinculados ao modelo e à conversa (editar o histórico invalida esses blocos) e recusas que podem ser reprocessadas no servidor.

## Decisão
1. **Loop manual** (não o Tool Runner do SDK): cada `tool_use` passa pelo `ActionRouter` antes de executar. O loop tem teto de 8 voltas por mensagem e checa orçamento a cada volta.
2. **Formato canônico = Messages API da Anthropic.** `LlmProvider` isola o SDK; outro provedor entraria como adaptador. Os testes usam `FakeLlmProvider` roteirizado (sem custo).
3. **Histórico append-only.** `Message.content` guarda os blocos exatamente como trocados com a API e é reenviado sem edição. Pedido de ferramenta e resultados são gravados juntos numa transação, então o histórico nunca termina com `tool_use` sem resposta. Recusa no meio do streaming é descartada (não entra no histórico).
4. **Action Router**: valida a entrada com Zod, aplica política por risco (`READ_ONLY` e `REVERSIBLE` executam; `EXTERNAL_STATE` e `IRREVERSIBLE` são negados até existir aprovação humana na Fase 5), limite diário por ferramenta, tempo limite de 30 s, registra `ActionExecution` e audita o que não é leitura.
5. **Só ferramentas reais são expostas.** Capacidades de fases futuras (vagas, candidaturas, navegador) não existem como ferramenta; o prompt instrui a dizer que ainda não estão disponíveis.
6. **Prompt de sistema estável** (cache de prompt); data/hora e nome do candidato vão num bloco `<contexto>` em cada mensagem. Conteúdo de documentos vai dentro de `<dados_externos>`.
7. **Recusas**: `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) em todas as chamadas.
8. **Custo**: `UsageRecord` por chamada, em micro-dólares, com preço por modelo; teto por candidato numa janela móvel de 24 h (`LLM_DAILY_BUDGET_USD`).
9. **Análise de currículo** roda no worker (fila `analysis`), com saída estruturada (`betaZodOutputFormat`). O modelo avalia seis critérios públicos; a nota final é calculada no backend pelos pesos — o modelo não define a nota total.

## Consequências
+ Permissões, limites e auditoria ficam no backend e são testáveis sem o modelo.
+ Trocar de modelo é configuração (`LLM_MODEL_PRIMARY`), sem mudar o loop.
− Conversas longas crescem sem compactação; adicionar compaction (beta) quando o volume justificar.
− O loop manual exige manter as regras de stop reason que o SDK não aplica sozinho (documentadas no código).
