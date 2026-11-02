# Casa de Leiloes Online

Reconstrucao local e incremental do projeto desenvolvido para o desafio Elite Dev da Verzel.

Este historico e uma organizacao retrospectiva da implementacao existente. Ele representa uma sequencia tecnica coerente para reconstruir o sistema e nao a cronologia original de desenvolvimento.

## Estado

A reconstrucao esta na etapa de fundacao. Os comandos e recursos funcionais serao documentados conforme os respectivos marcos forem integrados.

## Pre-requisitos locais

- Node.js 24
- npm 11
- PostgreSQL 18, sem dependencia de Docker ou WSL
- Git com identidade configurada pelo proprio colaborador

O baseline foi verificado localmente com Node.js 24.20.0, npm 11.19.0 e PostgreSQL 18.6.

## Isolamento da reconstrucao

Este repositorio e independente de `ps-verzel/`. O ambiente local deve usar exclusivamente:

- `auction_house_entregavel_dev` para desenvolvimento;
- `auction_house_entregavel_test` para integracao;
- `auction_house_entregavel_e2e` para E2E;
- API/Vite nas portas 3300/5373 em desenvolvimento;
- API/Vite/stub nas portas 3310/5374/3311 em E2E.

Nao reutilize arquivos `.env`, bancos, chaves, sessoes, capas persistidas, ledgers ou ancoras do projeto de origem. Crie `.env` a partir de `.env.example` e gere novos segredos localmente. O arquivo `.env` nunca deve ser versionado.

## Limites atuais

Producao e deploy nao fazem parte da reconstrucao local. A homologacao manual sera registrada separadamente depois dos testes automatizados e das verificacoes humanas exigidas.
