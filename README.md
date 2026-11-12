# JARVIS Career

Inteligência artificial de recolocação profissional: conhece o candidato, lê seus currículos, pesquisa vagas em fontes autorizadas, calcula compatibilidade, prepara candidaturas e prova, com evidências, tudo o que fez.

> Estado atual: **Fase 1 (fundação) entregue e testada.** Conversa por IA, pesquisa de vagas, automação de navegador/desktop, candidaturas e voz são as próximas fases — ver [status por funcionalidade](docs/05-plano-e-status.md).

## Requisitos

- Node.js ≥ 22.12 (desenvolvido em 24.14)
- Docker Desktop

## Primeira execução

```bash
npm install
npm run infra:up
cp apps/api/.env.example apps/api/.env      # gere um JWT_SECRET (instrução no arquivo)
cp apps/web/.env.example apps/web/.env.local
npm run build:shared
npm run db:generate
npm run db:migrate
```

Em três terminais:

```bash
npm run dev:api
```

```bash
npm run dev:worker
```

```bash
npm run dev:web
```

Acesse http://localhost:3000, crie uma conta e envie um currículo (PDF, DOCX ou TXT).

## Testes

```bash
npm test
```

Os e2e usam o banco `jarvis_test` (crie uma vez com `docker exec jarvis-career-postgres-1 psql -U jarvis -d jarvis -c "CREATE DATABASE jarvis_test;"`) e copie `.env.example` para `apps/api/.env.test` apontando para ele, Redis db 1 e `STORAGE_LOCAL_DIR=./storage-test`:

```bash
npm run test:e2e
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [00 — Diagnóstico do ambiente](docs/00-diagnostico-ambiente.md) | Máquina, versões, MCPs |
| [01 — Arquitetura](docs/01-arquitetura.md) | Camadas, diagramas, fluxos, diretórios, modelo de dados |
| [02 — Estratégias](docs/02-estrategias.md) | IA, navegador, desktop, visual, voz, operação contínua |
| [03 — Segurança e LGPD](docs/03-seguranca-lgpd.md) | Controles e obrigações |
| [04 — Custos](docs/04-custos.md) | Estimativas e controles |
| [05 — Plano e status](docs/05-plano-e-status.md) | O que está planejado, implementado, testado |
| [Matriz de plataformas](docs/research/matriz-plataformas.md) | Gupy, Greenhouse, Lever, Ashby, LinkedIn… |
| [Integrações](docs/integracoes.md) | MCPs de desenvolvimento × dependências de produção |
| [ADRs](docs/adr/) | Decisões de arquitetura |
