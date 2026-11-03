# Casa de Leilões Online

Aplicação full stack para leilões de livros, reconstruída localmente para o desafio Elite Dev da Verzel. Leiloeiros pesquisam obras na Open Library e publicam lotes; licitantes usam uma carteira simulada, disputam em tempo real e consultam arremates e comprovantes públicos. O histórico de lances é verificável por cadeia SHA-256, assinaturas Ed25519 e um ledger JSONL independente do PostgreSQL.

Este repositório é uma reconstrução retrospectiva da implementação funcional. Seus commits foram organizados em uma sequência técnica incremental e coerente; eles não representam a cronologia histórica original do desenvolvimento.

## Funcionalidades

- Cadastro, login, sessão por cookie seguro e autorização por papel.
- Pesquisa bibliográfica na Open Library e armazenamento local de capas.
- Criação, agendamento, publicação e cancelamento protegido de lotes.
- Vitrine pública com filtros, paginação e sala de leilão responsiva.
- Lances transacionais com idempotência, locks, reservas financeiras e prorrogação automática.
- Atualizações por Socket.IO com ressincronização HTTP após reconexão.
- Scheduler local, recuperação de operações pendentes e liquidação idempotente.
- Carteira simulada, extrato, participações, vitórias e comprovantes públicos sem dados pessoais.
- Auditoria pública com detecção de adulteração no banco ou no ledger.

## Tecnologias

- Node.js 24, TypeScript 7 e npm workspaces.
- React 19, Vite 8, React Router 7 e Tailwind CSS 4.
- Express 5, Prisma ORM 7.10.1, `@prisma/adapter-pg` e PostgreSQL 18.
- Socket.IO 4, Zod 4, Vitest 5, Supertest e Playwright 1.64.

## Estrutura

```text
apps/api/       API Express, domínio, scheduler, recuperação e Socket.IO
apps/web/       aplicação React, componentes, testes e fluxos Playwright
prisma/         schema, migration inicial e seed idempotente
scripts/        segurança de banco, chaves, E2E e smoke externo
data/covers/    capas locais geradas em execução; conteúdo ignorado pelo Git
data/audit/     ledgers e âncoras locais; conteúdo ignorado pelo Git
```

A documentação operacional está concentrada neste README. Documentos internos de Kanban, roadmap e gestão não fazem parte do entregável.

## Pré-requisitos no Windows

- Node.js 24 LTS e npm 11.
- PostgreSQL 18 instalado nativamente.
- Microsoft Edge instalado para os testes E2E.
- Git com a identidade real do colaborador configurada.

O projeto não depende de Docker, WSL, Redis ou serviços pagos. A reconstrução foi validada com Node.js 24.20.0, npm 11.19.0 e PostgreSQL 18.6.

## Bancos exclusivos

Este repositório recusa os bancos do projeto de origem. Crie um usuário e três bancos exclusivos, ajustando apenas a senha local:

```sql
CREATE ROLE auction_entregavel WITH LOGIN PASSWORD 'SUA_SENHA_LOCAL';
CREATE DATABASE auction_house_entregavel_dev OWNER auction_entregavel;
CREATE DATABASE auction_house_entregavel_test OWNER auction_entregavel;
CREATE DATABASE auction_house_entregavel_e2e OWNER auction_entregavel;
ALTER DATABASE auction_house_entregavel_dev SET timezone TO 'UTC';
ALTER DATABASE auction_house_entregavel_test SET timezone TO 'UTC';
ALTER DATABASE auction_house_entregavel_e2e SET timezone TO 'UTC';
```

Se o usuário ou os bancos já existirem, não os recrie nem faça reset. Garanta somente que `auction_entregavel` tenha permissões para migrations nos três bancos e que o timezone seja UTC.

As proteções conferem o nome na URL e executam `SELECT current_database()` antes de migrations, seeds, truncamentos ou limpeza de fixtures. Uma divergência encerra a operação imediatamente. Não há fallback para nomes de banco do projeto original.

## Configuração

Instale as dependências e crie o arquivo local de ambiente:

```powershell
npm install
Copy-Item .env.example .env
```

Edite apenas as credenciais PostgreSQL e o e-mail de contato em `.env`. Depois gere um novo segredo de sessão e um novo par Ed25519 diretamente no arquivo ignorado pelo Git:

```powershell
npm run config:secrets
```

Variáveis principais:

- `DATABASE_URL`: exclusivamente `auction_house_entregavel_dev`.
- `TEST_DATABASE_URL`: exclusivamente `auction_house_entregavel_test`.
- `E2E_DATABASE_URL`: exclusivamente `auction_house_entregavel_e2e`; é obrigatória e não possui fallback.
- `SESSION_SECRET`: segredo aleatório com no mínimo 32 caracteres.
- `AUDIT_PRIVATE_KEY` e `AUDIT_PUBLIC_KEY`: par Ed25519 exclusivo deste ambiente.
- `AUDIT_ANCHOR_DIR` e `COVER_STORAGE_DIR`: caminhos relativos mantidos dentro do repositório.
- `OPEN_LIBRARY_CONTACT_EMAIL`: contato enviado no `User-Agent` da integração real.

Nunca versione `.env`, chave privada, sessões, bancos, capas geradas, ledgers, âncoras ou assinaturas locais.

## Preparar o banco de desenvolvimento

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
```

`db:migrate` confirma o banco conectado antes de executar `prisma migrate deploy`. `db:seed` só aceita o banco de desenvolvimento e cria um cenário idempotente com lotes agendado, ao vivo e encerrado.

Para preparar o banco de integração uma vez:

```powershell
npm run db:migrate:test
```

O banco E2E é migrado e preparado automaticamente por `npm run test:e2e`.

### Contas demonstrativas

| Papel | E-mail | Senha somente para demonstração local |
|---|---|---|
| Leiloeiro | `leiloeiro@casadeleiloes.local` | `Demo1234!` |
| Licitante | `licitante1@casadeleiloes.local` | `Demo1234!` |
| Licitante | `licitante2@casadeleiloes.local` | `Demo1234!` |

Essas credenciais são dados de fixture, não credenciais reais ou de produção.

## Executar localmente

```powershell
npm run dev
```

- Interface: <http://localhost:5373>
- API: <http://localhost:3300>
- Saúde: <http://localhost:3300/api/health>

Para executar a API compilada:

```powershell
npm run build
npm start
```

## Testes e qualidade

```powershell
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run build
npm run test:external:open-library
```

A suíte determinística validada contém 113 testes:

- 29 testes unitários da API em 8 arquivos.
- 30 testes de componentes web em 10 arquivos.
- 49 testes de integração com PostgreSQL em 19 arquivos.
- 5 fluxos E2E no Microsoft Edge.

Os testes de integração usam somente `auction_house_entregavel_test`, diretórios próprios de capas/auditoria e confirmação do banco ativo antes de `TRUNCATE`.

O E2E usa somente:

- banco `auction_house_entregavel_e2e`;
- API `3310`;
- Vite `5374`;
- stub local da Open Library `3311`;
- `data/covers/e2e` e `data/audit/anchors/e2e`.

O Playwright não reutiliza servidores existentes. Navegador, Vite, API, PostgreSQL, download local da capa e filesystem são reais; somente a Open Library é controlada pelo stub determinístico. `npm run test:external:open-library` consulta a Open Library real separadamente e exige internet. Esse smoke não integra a contagem de 113 testes e nunca deve ser declarado aprovado sem execução efetiva.

## Arquitetura e invariantes

Valores financeiros usam `BIGINT` em centavos no PostgreSQL e strings nos contratos JSON. Um lance reserva o valor integral do líder e libera a reserva anterior na mesma transação. Locks `SELECT ... FOR UPDATE`, ordem determinística de bloqueios e constraints do banco protegem concorrência e saldos.

Depósitos, lances e liquidações são idempotentes. Socket.IO transporta notificações, mas PostgreSQL e o relógio do servidor são as fontes da verdade. Após reconexão, a interface refaz consultas HTTP para recuperar o estado canônico.

O scheduler inicia lotes vencidos, encerra leilões e liquida resultados. Na inicialização, a API verifica o banco, recupera operações de auditoria pendentes e executa um ciclo antes de aceitar tráfego.

## Auditoria

Cada lote recebe registros `GENESIS_PREPARE` e `GENESIS_COMMIT`. Lances usam serialização canônica, cadeia SHA-256, assinaturas Ed25519 e eventos `BID_PREPARE`, `BID_COMMIT` ou `ABORT` no ledger local.

A verificação pública compara o ledger inteiro com o PostgreSQL, incluindo genesis, assinaturas, encadeamento, sequência e quantidade de lances:

- `INTEGRO`: as provas completas correspondem.
- `ADULTERADO`: existe divergência comprovada.
- `INCONCLUSIVO`: faltam evidências ou há operação pendente/inacessível.

O filesystem local não é fisicamente imutável. O modelo detecta adulteração direta do banco por um agente sem acesso simultâneo ao ledger e à chave privada; comprometimento conjunto desses três recursos está fora da garantia local.

## Limitações e estado de entrega

- A carteira e os depósitos são simulações; não há pagamento real.
- A pesquisa de novos livros depende da Open Library, mas lotes já importados continuam locais.
- O scheduler foi projetado para um único processo Node.js local.
- A homologação automatizada passou, mas validações manuais em navegadores distintos, dispositivo físico e leitor de tela permanecem pendentes.
- VPS, domínio, HTTPS, armazenamento imutável, observabilidade e deploy público não foram configurados. Funcionamento local não significa prontidão de produção.

## Uso de inteligência artificial

O projeto e esta reconstrução utilizaram assistência do Codex/OpenAI para análise, transporte incremental, geração e revisão de código, testes e documentação. A classificação hipotética de responsabilidades do planejamento não representa autoria histórica humana. Os commits registram a autoria e as datas reais do Git, e sua sequência é explicitamente retrospectiva. A assistência de IA não substitui revisão técnica, homologação manual ou responsabilidade sobre uma implantação futura.
