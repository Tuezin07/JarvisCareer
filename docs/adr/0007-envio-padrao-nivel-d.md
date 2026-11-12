# ADR-0007 — Envio de candidatura padrão em nível D até autorização por plataforma

- Status: aceito (2026-11-11)

## Contexto
As APIs de submissão de Greenhouse, Lever e Ashby exigem chave da empresa empregadora. Portais brasileiros não oferecem API de candidato documentada, e termos de uso de várias plataformas restringem automação.

## Decisão
O comportamento padrão é preparar a candidatura completa (currículo, carta, respostas validadas) e encaminhar o candidato ao formulário oficial (nível D). A automação de formulário (nível C) será habilitada **por plataforma**, após revisão de termos, com o candidato presente para CAPTCHA/MFA. Nenhuma técnica de evasão será implementada.
