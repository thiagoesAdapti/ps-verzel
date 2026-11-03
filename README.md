# Casa de Leilões Online

Plataforma web de leilões de livros desenvolvida para o desafio técnico **Elite Dev — Verzel**. O sistema permite que leiloeiros publiquem lotes a partir do catálogo da Open Library e que licitantes participem de disputas em tempo real utilizando uma carteira financeira simulada.

O projeto também oferece histórico público de lances, comprovantes de arrematação e mecanismos de auditoria capazes de identificar divergências entre os registros do PostgreSQL e um histórico independente assinado criptograficamente.

> **Ambiente de demonstração:** os depósitos e valores negociados são fictícios. Nenhuma transação financeira real é realizada.

## Funcionalidades

**Leiloeiro**

- Pesquisa de livros na Open Library, com importação dos dados bibliográficos e armazenamento local das capas.
- Criação de lotes com descrição do exemplar, estado de conservação, lance inicial, incremento mínimo e período de disputa.
- Publicação imediata ou agendada, acompanhamento dos próprios lotes e cancelamento permitido somente antes do primeiro lance.
- Consulta de lances, encerramentos e valores recebidos após a liquidação.

**Licitante**

- Cadastro, autenticação e acesso às funcionalidades conforme o perfil.
- Vitrine pública com filtros por situação e paginação.
- Sala de leilão com histórico, contagem regressiva e atualização de lances em tempo real.
- Depósitos simulados e carteira com saldo total, reservado e disponível.
- Acompanhamento das disputas, identificação de liderança e consulta aos arremates.
- Comprovantes públicos compartilháveis, sem exposição de dados pessoais.

**Regras de negócio e confiabilidade**

- Validação transacional dos lances, com incremento mínimo e prevenção de lances inválidos.
- Reserva do saldo do maior licitante e liberação da reserva anterior ao ser superado.
- Proteção contra concorrência, repetição de requisições e operações duplicadas.
- Prorrogação automática quando um lance é aceito nos dois minutos finais.
- Encerramento automatizado dos lotes, liquidação idempotente e recuperação de operações pendentes.
- Auditoria pública da integridade dos lances e dos registros do lote.

## Tecnologias

| Camada | Tecnologias |
|---|---|
| Front-end | React 19, TypeScript, Vite 8, React Router 7, Tailwind CSS 4 |
| Back-end | Node.js 24, Express 5, TypeScript, Zod 4 |
| Banco de dados | PostgreSQL 18, Prisma ORM 7 e `@prisma/adapter-pg` |
| Tempo real | Socket.IO 4 |
| Catálogo externo | Open Library |
| Testes | Vitest, Supertest e Playwright |
| Organização | Monorepo com npm workspaces |

## Estrutura do projeto

```text
apps/
  api/            API REST, serviços de domínio, auditoria e Socket.IO
  web/            aplicação React, componentes e testes E2E
prisma/           schema, migrations e seed
scripts/          preparação de ambiente, testes e verificações de segurança
data/covers/      capas persistidas localmente durante a execução
data/audit/       registros de auditoria e âncoras locais
```

Os arquivos operacionais gerados em `data/`, os segredos e as credenciais não são versionados.

## Pré-requisitos

- Node.js 24 LTS e npm 11.
- PostgreSQL 18.
- Microsoft Edge para a execução dos testes E2E conforme a configuração atual.
- Acesso à internet para pesquisar novos livros na Open Library.

O desenvolvimento local não exige Docker, WSL, Redis ou serviços pagos.

## Instalação e configuração local

Os exemplos a seguir utilizam **PowerShell no Windows**, na raiz do repositório.

### 1. Instalar as dependências

```powershell
npm install
```

### 2. Criar os bancos PostgreSQL

A aplicação utiliza três bancos independentes, separando desenvolvimento, testes de integração e testes E2E.

Conecte-se ao PostgreSQL com um usuário administrador, utilizando `psql`, e crie o usuário da aplicação:

```sql
CREATE ROLE auction_entregavel LOGIN;
```

No próprio `psql`, defina a senha de maneira interativa:

```text
\password auction_entregavel
```

Crie os bancos:

```sql
CREATE DATABASE auction_house_entregavel_dev OWNER auction_entregavel;
CREATE DATABASE auction_house_entregavel_test OWNER auction_entregavel;
CREATE DATABASE auction_house_entregavel_e2e OWNER auction_entregavel;

ALTER DATABASE auction_house_entregavel_dev SET timezone TO 'UTC';
ALTER DATABASE auction_house_entregavel_test SET timezone TO 'UTC';
ALTER DATABASE auction_house_entregavel_e2e SET timezone TO 'UTC';
```

Caso o usuário ou algum banco já exista, não recrie nem apague dados existentes. A configuração atual valida explicitamente os nomes permitidos e consulta `SELECT current_database()` antes de operações potencialmente destrutivas.

### 3. Configurar as variáveis de ambiente

```powershell
Copy-Item .env.example .env
```

Edite o arquivo `.env` com as credenciais dos três bancos e o e-mail de contato utilizado na integração com a Open Library. As principais variáveis são:

| Variável | Finalidade |
|---|---|
| `DATABASE_URL` | Banco de desenvolvimento |
| `TEST_DATABASE_URL` | Banco de testes de integração |
| `E2E_DATABASE_URL` | Banco exclusivo de testes E2E |
| `SESSION_SECRET` | Segredo de assinatura da sessão |
| `AUDIT_PRIVATE_KEY` e `AUDIT_PUBLIC_KEY` | Par de chaves Ed25519 para auditoria |
| `AUDIT_ANCHOR_DIR` | Diretório local das evidências de auditoria |
| `COVER_STORAGE_DIR` | Diretório local das capas importadas |
| `OPEN_LIBRARY_CONTACT_EMAIL` | Contato informado no `User-Agent` da integração |

Gere o segredo da sessão e o par de chaves da auditoria:

```powershell
npm run config:secrets
```

**Não publique o `.env` nem as chaves privadas.** Se a senha do PostgreSQL contiver caracteres especiais, utilize a codificação adequada nas URLs de conexão.

### 4. Preparar o banco de desenvolvimento

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
```

O seed é idempotente e cria contas demonstrativas e lotes em diferentes situações.

### 5. Iniciar a aplicação

```powershell
npm run dev
```

| Serviço | Endereço local |
|---|---|
| Interface web | http://localhost:5373 |
| API | http://localhost:3300 |
| Health check | http://localhost:3300/api/health |

Para gerar a versão compilada e executar a API:

```powershell
npm run build
npm start
```

## Acessos de demonstração

Após executar o seed, utilize as seguintes contas **exclusivamente em ambiente local**:

| Perfil | E-mail | Senha |
|---|---|---|
| Leiloeiro | `leiloeiro@casadeleiloes.local` | `Demo1234!` |
| Licitante 1 | `licitante1@casadeleiloes.local` | `Demo1234!` |
| Licitante 2 | `licitante2@casadeleiloes.local` | `Demo1234!` |

Esses acessos são fictícios e não devem ser utilizados em produção.

## Testes

```powershell
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run build
```

A suíte automatizada contém **113 testes aprovados**:

| Categoria | Testes |
|---|---:|
| Unitários da API | 29 |
| Componentes web | 30 |
| Integração com PostgreSQL | 49 |
| E2E no Microsoft Edge | 5 |
| **Total** | **113** |

Os testes de integração utilizam um banco separado. O Playwright executa a aplicação e a API em portas próprias, com PostgreSQL e navegador reais. Apenas as respostas da Open Library são controladas por um serviço local durante os cenários determinísticos.

Para testar separadamente a integração com a API pública real da Open Library:

```powershell
npm run test:external:open-library
```

Essa verificação depende de conectividade e não integra a contagem dos 113 testes.

## Decisões de arquitetura

### Integridade dos lances e saldos

Valores monetários são armazenados em centavos, utilizando `BIGINT` no PostgreSQL. Os contratos JSON expõem os valores como strings para evitar perda de precisão.

Os lances são processados em transações com bloqueios de linha (`SELECT ... FOR UPDATE`), validações de saldo e regras de incremento. A reserva financeira do licitante anterior é liberada na mesma transação em que o novo líder é estabelecido.

Depósitos, lances e liquidações usam controles de idempotência para impedir processamento duplicado.

### Atualizações em tempo real

O Socket.IO notifica os clientes sobre mudanças na disputa, enquanto o PostgreSQL e o relógio do servidor permanecem como fontes oficiais do estado. Após uma reconexão, a interface consulta novamente a API para sincronização.

### Encerramento e recuperação

Um scheduler acompanha o início e o encerramento dos lotes, realiza a liquidação dos resultados e ajuda a recuperar operações pendentes após reinicializações.

### Auditoria pública

O sistema combina serialização canônica, encadeamento SHA-256, assinaturas Ed25519 e um ledger JSONL independente do banco relacional. A verificação compara a sequência de eventos e os registros persistidos no PostgreSQL.

Os resultados possíveis são:

- `INTEGRO`: registros e provas verificadas correspondem.
- `ADULTERADO`: foi identificada uma divergência comprovada.
- `INCONCLUSIVO`: não há evidências suficientes para afirmar a integridade.

A proteção foi projetada para detectar alterações diretas no banco sem acesso simultâneo ao ledger e à chave privada. Ela não equivale a armazenamento fisicamente imutável nem protege contra o comprometimento conjunto desses recursos.

## Escopo e limitações

- Os depósitos e pagamentos são simulados; não ocorre movimentação financeira real.
- A busca de novos livros depende da disponibilidade da Open Library. Os lotes já importados permanecem acessíveis localmente.
- O scheduler foi projetado para um único processo da API neste ambiente.
- Os testes automatizados foram executados; a homologação manual em navegadores distintos, dispositivo físico e leitor de tela permanece uma etapa adicional.
- O ambiente descrito neste README é local. A disponibilização pública exige configuração própria de infraestrutura, HTTPS, segredos e persistência adequada.

## Uso de inteligência artificial

Ferramentas de inteligência artificial, incluindo o Codex, foram utilizadas como apoio à análise de requisitos, ao planejamento técnico, à implementação e revisão de código, à elaboração de testes e à documentação.

O uso dessas ferramentas foi acompanhado de critérios de aceite, verificações automatizadas e revisão das regras de negócio, especialmente nas operações de lances, carteira e auditoria.
