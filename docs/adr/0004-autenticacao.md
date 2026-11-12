# ADR-0004 — Autenticação com cookies httpOnly, JWT curto e refresh opaco rotativo

- Status: aceito (2026-11-11)

## Decisão
- Senhas com Argon2id.
- Access token JWT (15 min) em cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção. Nenhum token acessível ao JavaScript do frontend.
- Refresh token opaco (32 bytes aleatórios), armazenado como hash SHA-256 em `RefreshToken`, com `familyId`. Cada uso gera um novo token e revoga o anterior; reuso de um token já revogado revoga a família inteira (detecção de roubo).
- Cookie de refresh com `path=/api/auth` para não trafegar em outras rotas.

## Alternativas descartadas
- Token em `localStorage`: exposto a XSS.
- Provedor externo (Auth0, Clerk): custo e dependência desnecessários na fundação; OAuth social pode ser adicionado depois sobre o mesmo modelo de sessão.
