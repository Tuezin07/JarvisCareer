# ADR-0010 — JARVIS WEB: executor de navegador isolado, política de rede e evidências

- Status: aceito (2026-11-14)

## Contexto
A Fase 4 dá ao JARVIS um navegador. Páginas de candidatura são conteúdo não confiável: podem redirecionar para a rede interna, carregar recursos de endereços privados, pedir CAPTCHA, login ou verificação em duas etapas. A API atende todos os candidatos e não pode executar cliques, downloads nem navegação no mesmo processo (requisito da arquitetura de referência). O envio de candidaturas só chega na Fase 5, com aprovação por candidatura (ADR-0007).

## Decisão
1. **Processo separado** (`apps/automation`): consome a fila `automation` e devolve o resultado pela fila `automation-results`. **Não tem acesso ao banco nem ao storage**: só ao Redis (filas, sinal de cancelamento e estado efêmero do núcleo). A API cria a `BrowserSession`, enfileira a tarefa e o worker da API grava resultado e evidências.
2. **Uma sessão de navegador por tarefa**: contexto novo do Chromium (Playwright), sem downloads (`acceptDownloads: false`), sem service workers, fechado no fim. Provedores: `local` (padrão) ou `browserbase` (CDP remoto).
3. **Política de rede (`NetworkGuard`)**, aplicada em toda requisição e em cada salto de redirecionamento (o Playwright não intercepta os saltos sozinho; o executor busca com `maxRedirects: 0` e valida o `Location`):
   - navegação principal só em HTTPS e só nos hosts da allowlist do ATS da vaga;
   - recursos de outros hosts públicos são permitidos (CDNs), mas nunca IP privado, loopback, link-local (inclui `169.254.169.254`), `localhost`, `.local`, `.internal` ou nome que resolva para rede interna;
   - protocolos perigosos (`file:`, `javascript:`…) bloqueados; WebSockets passam pela mesma política;
   - exceção única: o `host:porta` exato do site de testes (`AUTOMATION_ALLOW_LOOPBACK`).
4. **Bloqueios exigem uma pessoa**: CAPTCHA, login com senha e verificação em duas etapas são detectados e reportados; o executor nunca tenta resolver nem contornar.
5. **Mapeamento de formulário sem invenção** (`mapFields`): cada campo vira `AUTO` (dado verificado do perfil), `NEEDS_HUMAN` ou `SKIPPED`, sempre com o motivo. Nunca preenche dado sensível (LGPD art. 11), documento de identificação, senha, consentimento, pretensão salarial, pergunta de escolha ou pergunta sobre outra pessoa. Campos de cadastro só se ligam ao perfil por `autocomplete` da página ou rótulo curto; rótulo longo é pergunta.
6. **Nesta fase não há envio**: `INSPECT_PAGE` só lê; `FILL_TEST_FORM` preenche apenas o site de testes controlado e para antes de enviar. A inspeção recebe do perfil só a **presença** de cada dado, não o valor.
7. **Evidências** (capturas JPEG) só com o consentimento `EVIDENCE_SCREENSHOTS`, rechecado ao gravar; ficam no storage privado, servidas só ao dono (`no-store`, `Cross-Origin-Resource-Policy: same-site`), e expiram em `EVIDENCE_RETENTION_DAYS` (30 por padrão; limpeza diária na fila `maintenance`). O resultado guardado tem passos, campos e motivos — nunca os valores preenchidos.
8. **Limites**: uma sessão ativa por candidato, 20 por 24 h, tempo e número de passos por tarefa, cancelamento imediato ("Parar agora" ou pausa global).

## Consequências
+ Uma página maliciosa não alcança a rede interna nem o banco; derrubar o executor não derruba a API.
+ Verificado com página real (Greenhouse da Stone): o mapeamento foi ajustado com base no DOM real (perguntas agrupadas, inputs auxiliares ignorados, rótulo do anexo, pergunta sobre quem indicou).
− Isolamento por processo, não por container: em produção (Fase 9) cada sessão deve rodar em container efêmero com limites de CPU/memória e rede de saída controlada.
− As tarefas na fila não são assinadas; o Redis é a fronteira de confiança. Assinatura HMAC das tarefas fica planejada para quando o executor sair da máquina da API.
− Executor adaptativo (Stagehand) e o provedor Browserbase pelo executor ainda não foram verificados de ponta a ponta (o primeiro depende de créditos de IA; o segundo consome minutos da conta).
