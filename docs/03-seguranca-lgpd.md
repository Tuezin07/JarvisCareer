# 03 — Segurança, privacidade e LGPD

## Implementado na Fase 1

| Controle | Como |
|---|---|
| Senhas | Argon2id (`argon2`), nunca armazenadas ou logadas em texto puro |
| Sessão | JWT de acesso curto (15 min) em cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção; *refresh token* opaco, guardado apenas como hash SHA-256, com rotação a cada uso e revogação de toda a família em caso de reuso |
| Isolamento multiusuário | Todo serviço de domínio recebe o `userId` do token e filtra por ele; não há rota que aceite `userId` do cliente para dados de candidato. Testes e2e cobrem acesso cruzado |
| Upload | Limite de tamanho, validação do tipo real pelo conteúdo (*magic bytes*) — PDF, DOCX, TXT; nome original nunca usado como caminho; hash SHA-256; arquivos fora da pasta pública |
| Entrada | Validação Zod em todas as rotas (contratos em `packages/shared`) |
| Cabeçalhos | `helmet`, CORS restrito à origem do frontend com credenciais |
| Força bruta | *Rate limit* global e mais estrito em login/registro (`@nestjs/throttler`) |
| Auditoria | `AuditLog` para registro, login, falhas de login, upload, exclusão, exportação e consentimentos, com IP e user agent; logs estruturados com redação de campos sensíveis |
| Segredos | Somente via variáveis de ambiente; `.env` fora do git; nenhum token no frontend |

## LGPD — obrigações mapeadas

| Tema (LGPD) | Tratamento no produto | Estado |
|---|---|---|
| Base legal (art. 7º) | Execução de contrato/serviço solicitado pelo titular + consentimento específico para envio automatizado de candidaturas | Consentimentos versionados em `Consent` (Fase 1) |
| Transparência (art. 9º) | Política de privacidade, explicação de cada automação, histórico de ações com evidência | Fase 1 (histórico) / Fase 9 (textos) |
| Minimização (art. 6º, III) | Coletar apenas campos de perfil necessários; screenshots com retenção curta | Contínuo |
| Direitos do titular (art. 18) | Exportação dos dados (JSON) e exclusão da conta com remoção de arquivos | Fase 1: exportação e exclusão implementadas |
| Revogação do consentimento (art. 8º, §5º) | Revogar autorização de envio interrompe jobs pendentes | Fase 1 (registro) / Fase 5 (efeito nos envios) |
| Dados sensíveis (art. 11) | Não solicitar nem inferir; não usar em compatibilidade; se presentes no currículo, não são extraídos para o perfil | Fase 2 |
| Segurança (art. 46) | Controles acima + criptografia em trânsito; criptografia em repouso no provedor cloud | Produção |
| Acesso administrativo | Admin vê métricas agregadas e operação; acesso a dados de um candidato exige justificativa registrada | Fase 9 |
| Encarregado (DPO) e RIPD | Definir encarregado e relatório de impacto antes da comercialização | **Pendente — validação jurídica obrigatória** |

## Segurança do agente visual (Fases 4–6)

Ver [02-estrategias.md](02-estrategias.md) §2–3. Resumo: execução em container/VM efêmero, privilégio mínimo, allowlist de domínios, bloqueio de redes privadas e protocolos perigosos, validação de redirecionamentos, cookies isolados por candidato, sem stealth/bypass, parada de emergência, limites de tempo e de passos.

## Fraude em vagas (Fase 3)

Classificação baixo/moderado/elevado/crítico com sinais determinísticos (domínio recém-criado, pedido de pagamento, divergência empresa×domínio, coleta de documentos sensíveis no primeiro contato, salário incompatível) + análise do LLM explicando os motivos. Risco crítico bloqueia envio até revisão do candidato. Nunca afirmar que uma empresa é fraudulenta — apenas os sinais encontrados.
