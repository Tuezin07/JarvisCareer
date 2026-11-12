# ADR-0006 — Server-Sent Events para estado e atividade do agente

- Status: aceito (2026-11-11)

## Decisão
O fluxo servidor→interface (estado do núcleo, eventos de atividade, streaming de respostas) usa SSE autenticado por cookie. WebSocket fica reservado para canais bidirecionais: Desktop Companion (Fase 6) e voz (via LiveKit, Fase 7).

## Motivos
SSE é unidirecional como o fluxo de eventos, atravessa proxies HTTP, reconecta sozinho e é nativo no NestJS (`@Sse`). Os eventos são publicados via Redis pub/sub para que workers em outro processo alimentem a mesma conexão.
