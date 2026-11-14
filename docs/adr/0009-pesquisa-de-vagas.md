# ADR-0009 — Pesquisa por empresas acompanhadas e compatibilidade determinística

- Status: aceito (2026-11-12)

## Contexto
A Fase 3 precisa de vagas reais e de uma nota de compatibilidade explicável. Só Greenhouse, Lever e Ashby têm APIs públicas oficiais de leitura de vagas por empresa (matriz de plataformas). Portais agregadores (LinkedIn, Gupy, Catho, Indeed) não oferecem acesso autorizado. A conta de IA ainda não tem créditos, e a nota precisa ser estável e auditável de qualquer forma.

## Decisão
1. **Fontes = páginas de vagas de empresas que o candidato acompanha** (link público do ATS) e vagas importadas por link. Nada de varrer a internet. `JobSource` é compartilhada entre candidatos (dado público); o vínculo e a compatibilidade são por candidato.
2. **Conectores só de leitura**, por API oficial, com allowlist de hosts, `redirect: 'error'`, tempo limite e limite de tamanho. Nenhum conector envia candidatura (envio continua nível D, ADR-0007).
3. **Sincronização no worker** (fila `research`): agendada a cada 6 h por empresa (`upsertJobScheduler`), sob demanda com deduplicação e trava por empresa no Redis. Vaga que some da página recebe `closedAt` (não é apagada). Circuit breaker: 5 falhas seguidas ou página inexistente desligam a fonte e avisam o candidato. A pausa do candidato é respeitada: empresa sem seguidores ativos não é lida.
4. **Compatibilidade determinística** (`match-engine.ts`), com os 7 critérios e pesos do prompt original, configuráveis por candidato (`CandidatePreferences.matchWeights`). Regras:
   - informação ausente na vaga **nunca elimina** — vira pergunta;
   - só restrição *eliminatória* com evidência no texto elimina; *importante* tira 15 pontos, *flexível* 5;
   - quando a vaga não informa anos de experiência, o nível do título (pleno/sênior/liderança) gera uma estimativa **declarada como estimativa**;
   - nível da vaga 2+ degraus acima do histórico limita a nota a 45, com o motivo exibido;
   - salário em moeda estrangeira não é comparado com a pretensão em reais;
   - nenhum dado sensível do candidato entra no cálculo.
5. **Sinais de fraude** determinísticos (pedido de pagamento, de dados sensíveis, promessas irreais, contato fora da plataforma), com evidência textual e sem acusar a empresa.
6. A análise semântica por IA da vaga entra como camada adicional quando houver créditos — não substitui a nota explicável.

## Consequências
+ Funciona sem custo de IA e com dados reais (verificado com a página pública da Stone: 347 vagas).
+ Cada nota é reproduzível e explicada por critério.
− Cobertura limitada a empresas que usam esses três ATS; competências reconhecidas por palavras-chave e um dicionário (~70 termos) — sinônimos e contexto podem escapar (informado como limitação em cada vaga).
