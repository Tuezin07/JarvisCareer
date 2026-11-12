# 02 — Estratégias técnicas

## 1. Inteligência artificial (Intelligence Core — Fase 2)

**Provedor inicial:** Anthropic Messages API via SDK oficial `@anthropic-ai/sdk` (TypeScript). Uma interface `LlmProvider` no backend isola o SDK para permitir troca de provedor sem tocar no orquestrador.

**Modelo padrão:** `claude-opus-5-5` para o cérebro (chat, planejamento, análise de currículo e de vaga). O roteamento de tarefas em massa para um modelo mais barato (`claude-haiku-5-5` ou `claude-sonnet-5-5`) é uma **decisão de custo do produto**, configurável por variável (`LLM_MODEL_PRIMARY`, `LLM_MODEL_BULK`) — o padrão de ambas é Opus 5.5 até haver medição de qualidade por rota.

Pontos da API atual que o código precisa respeitar (verificados na referência da API):

| Tema | Regra |
|---|---|
| Thinking | Opus 5.5 usa thinking adaptativo e não aceita `disabled` nem `budget_tokens`; a profundidade é controlada por `output_config.effort` (padrão `medium` — definir explicitamente por rota: `low` para chat simples, `high` para análise de currículo) |
| Ferramentas | `tool_choice` forçado (`any`/`tool`) retorna 400 no Opus 5.5 → usar `auto` + `strict: true` nas ferramentas + instrução no prompt; ou `output_config.format` quando só se quer JSON |
| Saídas estruturadas | `output_config.format` com schema (análise de currículo, nota de compatibilidade) |
| Streaming | Respostas de chat sempre em streaming; com ferramentas do cliente, `eager_input_streaming: true` e validação do input contra o schema Zod antes de executar |
| Recusas | Tratar `stop_reason: "refusal"` antes de ler o conteúdo; habilitar o fallback do servidor (`fallbacks: "default"`) |
| Cache de prompt | System prompt + definições de ferramentas congelados e ordenados para maximizar `cache_read_input_tokens` |
| Computer use | No Opus 5.5 via Claude API, apenas `computer_toolset_20260801` |

**Ciclo do agente (limitado):** recebe → recupera contexto → chama o LLM com ferramentas → cada `tool_use` passa pelo Action Router (permissão/risco/limite) → executa ou enfileira → devolve `tool_result` real → repete até `end_turn` ou até atingir o limite de iterações/tokens/tempo da tarefa. Não existe loop sem teto.

**Memória:** três níveis — (1) histórico da conversa, (2) memórias estruturadas por candidato (`AgentMemory`: fato, preferência, decisão, com origem e data), (3) dados de domínio consultados por ferramentas (candidaturas, vagas, estatísticas). Respostas sobre números ("quantas candidaturas…") sempre vêm de ferramenta que consulta o banco.

**Prompt injection:** conteúdo externo (texto de vaga, página, currículo) entra em blocos marcados como dado não confiável; permissões nunca são decididas pelo modelo; ferramentas de escrita exigem aprovação conforme o modo de autonomia.

## 2. Navegador — JARVIS WEB (Fase 4)

| Camada | Uso |
|---|---|
| API oficial | Sempre que existir (ver matriz de plataformas) |
| Playwright | Executor determinístico principal: seletores por *role*, *label* e *test id*; nunca coordenadas |
| Stagehand (`act`/`observe`/`extract`/`agent`) | Executor adaptativo quando o layout varia; sempre seguido de validação determinística |
| Browserbase | Sessões remotas isoladas por candidato quando a infraestrutura local não bastar (custos a confirmar) |

Regras: cada ação relevante é seguida de observação (URL, mensagem, estado do formulário); allowlist de domínios por job; bloqueio de IPs privados/loopback e de protocolos `file:`, `chrome:`, `data:`; downloads e uploads só de/para o armazenamento do candidato; screenshots antes/depois com retenção limitada. Sem stealth, sem bypass de CAPTCHA/MFA — nesses casos o estado vira **Aguardando ação humana**.

## 3. Desktop — JARVIS DESKTOP (Fase 6)

- **Ambiente cloud:** container/VM Linux com Xvfb + gerenciador de janelas + VNC somente interno, usuário sem privilégios, sem credenciais persistentes, política de rede por allowlist, tempo máximo por sessão, destruído ao final. Controlado pelo serviço `automation` usando a ferramenta de computer use da Anthropic.
- **Quando usar:** só quando nem API nem Playwright resolvem (aplicativos sem web, diálogos nativos).
- **Desktop Companion (Windows):** aplicativo instalável que abre **conexão de saída** autenticada (WebSocket/TLS) para a API — nenhuma porta exposta. Pareamento por código de uso único, lista de aplicativos permitidos, indicador visível de atividade, botão de parada imediata, revogação e histórico local. Tecnologia candidata: Tauri 2 (binário pequeno, Rust) — decisão em ADR na Fase 6. Se o computador estiver desligado, a ferramenta retorna "indisponível" e o restante continua na nuvem.

## 4. Identidade visual (Fase 7, base já na Fase 1)

Direção de arte aprovada (referências do usuário): núcleo de inteligência luminoso, HUD radial com anéis concêntricos e telemetria, painéis holográficos em camadas, visualização de voz por ondas.

- **Paleta:** fundo `#03070d`, grafite `#0a121c`, azul elétrico `#1f8bff`, ciano `#35e1ff`, âmbar discreto `#ffb547` (alertas/aprovações), vermelho `#ff4d5e` (erro).
- **Núcleo:** SVG com anéis concêntricos independentes (rotação, varredura, pulsos), cujas animações são função do **estado real** recebido via SSE (`idle`, `listening`, `thinking`, `researching`, `analyzing`, `executing`, `waiting_approval`, `error`, `completed`). Canvas/Three.js só quando houver ganho real (partículas, 3D).
- **Acessibilidade:** `prefers-reduced-motion` reduz animações a transições de opacidade; contraste AA para texto; estado sempre também em texto, não só em cor/movimento.
- Proprietária: nenhum logotipo, tela, imagem ou som dos filmes é reproduzido.

## 5. Voz (Fase 7)

LiveKit Agents como transporte em tempo real (WebRTC, detecção de fim de fala, interrupção), com plugin Anthropic para o LLM e provedores de STT/TTS intercambiáveis por interface. Voz **original** escolhida em catálogo de TTS — sem clonagem de ator ou personagem. O áudio alimenta o visualizador do núcleo (amplitude do microfone no estado `listening`, amplitude do TTS ao falar). Texto continua sendo o canal de fallback e o contexto é o mesmo da conversa escrita.

## 6. Operação contínua (Fase 8, filas já na Fase 1)

- **BullMQ** com filas separadas por natureza: `resume`, `research`, `matching`, `applications`, `automation`, `reports`, `notifications`.
- Cada job tem `jobId` determinístico (idempotência), `attempts` + backoff exponencial, `timeout` lógico, limite de concorrência por fila e *rate limit* por conector.
- Agendamentos recorrentes por candidato via *Job Schedulers* do BullMQ (pesquisa diária, relatório diário/semanal), pausáveis pelo candidato.
- Falhas definitivas vão para uma fila de mortos lógica (`failed` retido + evento `AgentEvent` de erro) e alimentam o painel administrativo.
- Circuit breaker por conector externo (abre após N falhas consecutivas, meia-abertura após intervalo).
- **Pausa global por candidato** (`CandidatePreferences.searchPaused`) e **parada de emergência** (cancela jobs ativos do candidato) verificadas antes de cada execução.
- Temporal **não** é adotado agora: os fluxos atuais cabem em jobs curtos encadeados com estado no Postgres. Reavaliar se surgirem fluxos de dias com muitos passos dependentes.
