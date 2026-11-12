# ADR-0005 — Interface de armazenamento com driver local em desenvolvimento

- Status: aceito (2026-11-11)

## Contexto
Currículos e evidências precisam de armazenamento privado compatível com S3 em produção. A distribuição de imagens comunitárias de servidores S3 auto-hospedados mudou recentemente, e não queremos acoplar a fundação a uma imagem cuja disponibilidade não verificamos.

## Decisão
`StorageService` com interface `put/get/delete` por chave. Driver `local` (diretório fora da pasta pública, ignorado pelo git) em desenvolvimento. Driver `s3` (SDK AWS, qualquer endpoint compatível) entra quando o provedor de produção for escolhido.

## Consequências
+ Fundação testável sem serviço extra.
− O driver S3 não está implementado nem testado nesta fase (status: planejado).
