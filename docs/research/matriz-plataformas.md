# Matriz de plataformas de vagas e ATS

Versão 0.1 — 2026-11-11. Esta matriz separa **o que foi verificado em documentação oficial** do que ainda é **hipótese a validar**. Nenhuma linha "a validar" pode virar código antes de verificação (documentação + termos de uso).

## Níveis

| Nível | Capacidade |
|---|---|
| A | Pesquisa e envio autorizado por API |
| B | Pesquisa por API e candidatura em fluxo permitido |
| C | Automação de navegador permitida |
| D | Preparação e encaminhamento para candidatura manual |
| E | Integração indisponível ou sem autorização |

## Distinção crítica: API de leitura ≠ API de submissão

Os três ATS internacionais verificados (Greenhouse, Lever, Ashby) **expõem vagas publicamente para leitura**, mas a submissão por API usa uma **chave da empresa empregadora**, não do candidato. O JARVIS atua em nome do candidato, portanto **não pode usar essas APIs de submissão**. Para o candidato, a candidatura acontece no formulário hospedado do ATS.

## Matriz

| Plataforma | Leitura de vagas | Submissão | Nível atual | Status | Evidência |
|---|---|---|---|---|---|
| **Greenhouse** | `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs` e `/jobs/{job_id}` — públicos, sem autenticação | `POST .../boards/{board_token}/jobs/{id}` exige Basic Auth com a **chave da empresa**, e a doc exige proxy no servidor da empresa | **B (leitura) + D (envio)**; C só após revisão de termos | Verificado (doc oficial) | docs.greenhouse.io/job-board.html |
| **Lever** | `GET https://api.lever.co/v0/postings/{site}` e `/{site}/{posting-id}` (EU: `api.eu.lever.co`) | `POST /v0/postings/{site}/{id}?key=APIKEY` — chave gerada por Super Admin **da empresa**; limite de 2 req/s; a própria doc recomenda o formulário hospedado | **B (leitura) + D (envio)** | Verificado (repo oficial lever/postings-api) | github.com/lever/postings-api |
| **Ashby** | `GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}?includeCompensation=true` — campos `jobUrl`, `applyUrl`, `workplaceType`, `employmentType`, `compensation` | A doc pública não expõe submissão de candidato; `applyUrl` aponta para a página hospedada | **B (leitura) + D (envio)** | Verificado (doc oficial) | developers.ashbyhq.com/docs/public-job-posting-api |
| **Gupy** | A API oficial (`https://api.gupy.io/api/v2`) é de **integração da empresa** (vagas, prospects) com token da empresa. O portal público de vagas usa endpoints **não documentados** | Sem API de candidato documentada | **D** (descoberta via fonte autorizada a definir) | Parcial — termos de uso do candidato precisam de leitura jurídica antes de qualquer coleta automatizada | developers.gupy.io/v2.0/reference/conventions |
| **Workday** | Sem API pública de candidato; sites `*.myworkdayjobs.com` por empresa | Exige conta por empresa (tenant) | **D** | A validar | — |
| **LinkedIn** | Sem API pública de busca de vagas para terceiros; o User Agreement proíbe bots e scraping | — | **E** | A validar formalmente (programas de parceria) | — |
| **Indeed** | APIs de publisher/Apply são programas de parceria com aprovação | — | **E** (até haver parceria) | A validar | — |
| **Catho** | Sem API pública conhecida | — | **D/E** | A validar | — |
| **InfoJobs** | Existe `developer.infojobs.net`, mas para InfoJobs **Espanha**; não confirmado para o Brasil | — | **D/E** | A validar | — |
| **Vagas.com** | Sem API pública conhecida | — | **D/E** | A validar | — |
| **Sólides** | API de produto para empresas | — | **D/E** | A validar | — |
| **Pandapé** | Sem API pública de candidato conhecida | — | **D/E** | A validar | — |

## Estado da implementação (2026-11-12)

Leitura de vagas de Greenhouse, Lever e Ashby **implementada** (`apps/api/src/modules/jobs/connectors/`), verificada com dados reais e coberta por testes. Envio continua nível D para todos. Ver ADR-0009.

## Consequências para a arquitetura

1. **Conectores de leitura** (Fase 3) começam por Greenhouse, Lever e Ashby: APIs oficiais, públicas e estáveis. O usuário (ou uma lista curada) informa os *board tokens* das empresas de interesse.
2. **Fluxo de envio padrão é D**: o JARVIS prepara currículo, carta e respostas validadas, e entrega o link do formulário oficial. O modo C (navegador) só será habilitado por plataforma depois de revisão de termos, sempre com o candidato presente para CAPTCHA/MFA — nunca com bypass.
3. **Fontes brasileiras** (Gupy, Catho, Vagas.com, InfoJobs BR) exigem pesquisa adicional e revisão jurídica antes de qualquer coleta. Até lá, o candidato pode **colar o link** de uma vaga e o JARVIS lê apenas aquela página, sob demanda.
4. Cada conector declara em código seu nível, se a leitura é oficial e se a submissão é permitida; o Action Router recusa ações acima do nível declarado.
