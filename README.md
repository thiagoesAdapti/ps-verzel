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

## Implantação em produção na VPS

Esta configuração destina-se a Ubuntu 26.04 LTS, Node.js 24, PostgreSQL 18 e Caddy, sem Docker. A aplicação fica em `/srv/leilao/app`, a API escuta exclusivamente em `127.0.0.1:3300` e o Caddy publica o frontend, `/api` e `/socket.io` em `https://leilao.figueiredo.tech`.

Os arquivos em `deploy/` são modelos versionados. Antes de instalá-los, compare-os com a configuração atual da VPS. A configuração da cafeteria não deve ser substituída, removida ou reinicializada; adicione somente o novo virtual host e valide a configuração completa antes de recarregar o Caddy.

### 1. Usuário, diretórios e código

Crie um usuário de sistema sem privilégios administrativos e prepare os diretórios persistentes:

```bash
sudo adduser --system --group --home /srv/leilao --shell /usr/sbin/nologin leilao
sudo -u leilao git clone <URL_DO_REPOSITORIO> /srv/leilao/app
sudo install -d -o leilao -g leilao -m 0750 /srv/leilao/app/data/covers
sudo install -d -o leilao -g leilao -m 0750 /srv/leilao/app/data/audit/anchors
```

Instale as versões exatas do lockfile e gere os artefatos compilados:

```bash
cd /srv/leilao/app
sudo -u leilao npm ci
sudo -u leilao env NODE_ENV=production DATABASE_URL=postgresql://build-only@127.0.0.1:5432/auction_house_leilao_prod npm run build
```

A URL usada apenas no build possui o nome permitido, mas não é utilizada para conectar ao banco. A conexão real é lida pelo serviço a partir do arquivo protegido descrito abaixo.

### 2. Banco PostgreSQL exclusivo

Crie um papel próprio e o único banco aceito em produção. Defina a senha de forma interativa para não registrá-la no histórico do shell:

```sql
CREATE ROLE auction_leilao LOGIN;
\password auction_leilao
CREATE DATABASE auction_house_leilao_prod OWNER auction_leilao;
ALTER DATABASE auction_house_leilao_prod SET timezone TO 'UTC';
```

O PostgreSQL deve escutar apenas em loopback ou socket Unix. Preserve as regras necessárias à cafeteria e acrescente no `pg_hba.conf` somente o acesso local da nova aplicação, usando autenticação `scram-sha-256`. A porta `5432` não deve ser liberada no firewall público.

O comando de produção aceita exclusivamente `auction_house_leilao_prod`. Antes de chamar `prisma migrate deploy`, ele valida o nome na URL e executa `SELECT current_database()`. `migrate reset`, `migrate dev`, `db push` e o seed demonstrativo são recusados em produção.

### 3. Variáveis e segredos

Crie o diretório de configuração fora do repositório:

```bash
sudo install -d -o root -g leilao -m 0750 /etc/leilao
sudo touch /etc/leilao/leilao.env
sudo chown root:leilao /etc/leilao/leilao.env
sudo chmod 0640 /etc/leilao/leilao.env
sudoedit /etc/leilao/leilao.env
```

O arquivo `/etc/leilao/leilao.env` deve conter, sem valores de exemplo:

```dotenv
NODE_ENV=production
PORT=3300
APP_ORIGIN=https://leilao.figueiredo.tech
DATABASE_URL=postgresql://auction_leilao:<SENHA_CODIFICADA_NA_URL>@127.0.0.1:5432/auction_house_leilao_prod?schema=public
AUDIT_ANCHOR_DIR=/srv/leilao/app/data/audit/anchors
COVER_STORAGE_DIR=/srv/leilao/app/data/covers
OPEN_LIBRARY_CONTACT_EMAIL=<EMAIL_DE_CONTATO>
```

Gere um segredo de sessão e um par Ed25519 novos diretamente em um segundo arquivo. O script falha se o arquivo já existir, aplica modo `0600` e nunca imprime os valores:

```bash
sudo /usr/bin/node /srv/leilao/app/scripts/generate-production-secrets.ts /etc/leilao/leilao-secrets.env
sudo chown root:leilao /etc/leilao/leilao-secrets.env
sudo chmod 0640 /etc/leilao/leilao-secrets.env
```

Não copie `.env`, segredo de sessão nem chaves do ambiente local. Os dois arquivos em `/etc/leilao` devem permanecer fora do Git, não podem ser enviados ao frontend e precisam de backup criptografado com acesso restrito. Mantenha o mesmo par Ed25519 durante toda a vida das evidências já emitidas; trocar as chaves sem um procedimento de rotação torna a verificação histórica inconclusiva.

### 4. Migrations e serviços systemd

Instale as unidades fornecidas e confira se os caminhos de `node` e `npm` são `/usr/bin/node` e `/usr/bin/npm` nessa VPS:

```bash
sudo install -o root -g root -m 0644 deploy/leilao.service /etc/systemd/system/leilao.service
sudo install -o root -g root -m 0644 deploy/leilao-migrate.service /etc/systemd/system/leilao-migrate.service
sudo systemctl daemon-reload
sudo systemctl start leilao-migrate.service
sudo systemctl enable --now leilao.service
```

Não execute `npm run db:seed` em produção. A unidade `leilao-migrate.service` usa `prisma migrate deploy` e encerra sem iniciar a API se a URL ou o banco conectado não corresponderem à allowlist. A unidade `leilao.service` executa uma única instância da API como usuário `leilao`; isso evita duplicar o scheduler. `systemd` envia `SIGTERM`, permitindo que sockets e conexões com o banco sejam encerrados de forma controlada.

O banco preserva usuários, sessões, lotes, reservas e operações idempotentes. Os diretórios liberados para escrita pela unidade preservam capas e ledgers de auditoria entre reinicializações.

### 5. Caddy, HTTPS e SPA

O arquivo `deploy/Caddyfile.example` contém o virtual host do subdomínio. Instale-o como um arquivo adicional e faça o Caddyfile já existente importar os sites, sem substituir os blocos da cafeteria:

```bash
sudo install -d -o root -g root -m 0755 /etc/caddy/sites
sudo install -o root -g root -m 0644 deploy/Caddyfile.example /etc/caddy/sites/leilao.caddy
```

Adicione uma única vez ao `/etc/caddy/Caddyfile`, caso ainda não exista:

```caddyfile
import /etc/caddy/sites/*.caddy
```

Permita a leitura apenas dos artefatos estáticos e valide toda a configuração antes de uma recarga graciosa:

```bash
sudo chmod o+x /srv/leilao /srv/leilao/app /srv/leilao/app/apps /srv/leilao/app/apps/web
sudo chmod -R o=rX /srv/leilao/app/apps/web/dist
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

O bloco encaminha `/api/*` e `/socket.io*` para `127.0.0.1:3300`; o restante é servido a partir de `apps/web/dist`. O fallback de `try_files` entrega `index.html` para as rotas do React Router. O cliente usa URLs relativas, portanto API e Socket.IO permanecem na mesma origem pública e não dependem do proxy de desenvolvimento do Vite. O Caddy cuida da obtenção e renovação do certificado HTTPS quando o DNS do subdomínio aponta para a VPS e as portas `80` e `443` estão acessíveis.

### 6. Backup e verificações

Faça backups regulares e criptografados de:

- `auction_house_leilao_prod`, usando `pg_dump` e uma credencial não registrada na linha de comando;
- `/srv/leilao/app/data/covers` e `/srv/leilao/app/data/audit/anchors`;
- `/etc/leilao/leilao.env` e `/etc/leilao/leilao-secrets.env`, em armazenamento separado e com acesso mínimo.

Para obter uma cópia consistente entre PostgreSQL e ledger, use uma janela de manutenção e pare somente `leilao.service` durante a captura. Não pare nem altere os serviços da cafeteria. Teste periodicamente a restauração em ambiente isolado.

Depois da instalação ou atualização, verifique:

```bash
sudo systemctl status leilao.service --no-pager
sudo journalctl -u leilao.service -n 100 --no-pager
curl --fail http://127.0.0.1:3300/api/health
curl --fail https://leilao.figueiredo.tech/api/health
ss -lnt | grep -E '127\.0\.0\.1:3300|127\.0\.0\.1:5432'
```

Além do health check, valide cadastro, login, criação de lote, um lance, atualização em tempo real, encerramento, comprovante, carregamento de capa e auditoria. Confirme no navegador que o cookie `auction_sid` está marcado como `HttpOnly`, `Secure` e `SameSite=Lax`.

### 7. Atualização da aplicação

Em uma janela de manutenção, execute exatamente a sequência abaixo. Ela não usa reset, seed, push forçado nem altera outros serviços:

```bash
sudo systemctl stop leilao.service
sudo -u leilao git -C /srv/leilao/app status --short
sudo -u leilao git -C /srv/leilao/app pull --ff-only origin main
sudo -u leilao npm --prefix /srv/leilao/app ci
sudo -u leilao env NODE_ENV=production DATABASE_URL=postgresql://build-only@127.0.0.1:5432/auction_house_leilao_prod npm --prefix /srv/leilao/app run build
sudo install -o root -g root -m 0644 /srv/leilao/app/deploy/leilao.service /etc/systemd/system/leilao.service
sudo install -o root -g root -m 0644 /srv/leilao/app/deploy/leilao-migrate.service /etc/systemd/system/leilao-migrate.service
sudo install -o root -g root -m 0644 /srv/leilao/app/deploy/Caddyfile.example /etc/caddy/sites/leilao.caddy
sudo systemctl daemon-reload
sudo systemctl start leilao-migrate.service
sudo chmod -R o=rX /srv/leilao/app/apps/web/dist
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl start leilao.service
sudo systemctl reload caddy
curl --fail https://leilao.figueiredo.tech/api/health
```

O `status --short` deve estar vazio antes do `pull`. Se houver arquivos inesperados, interrompa e investigue em vez de descartá-los. Se build, migration ou validação do Caddy falhar, não inicie a nova versão nem contorne as proteções.

## Testes

```powershell
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run build
```

A suíte automatizada contém **115 testes aprovados**:

| Categoria | Testes |
|---|---:|
| Unitários da API | 30 |
| Componentes web | 30 |
| Integração com PostgreSQL | 50 |
| E2E no Microsoft Edge | 5 |
| **Total** | **115** |

Os testes de integração utilizam um banco separado. O Playwright executa a aplicação e a API em portas próprias, com PostgreSQL e navegador reais. Apenas as respostas da Open Library são controladas por um serviço local durante os cenários determinísticos.

Para testar separadamente a integração com a API pública real da Open Library:

```powershell
npm run test:external:open-library
```

Essa verificação depende de conectividade e não integra a contagem dos 115 testes.

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
- A operação pública depende da configuração correta da VPS, monitoramento, backups testados e homologação manual após cada implantação.

## Uso de inteligência artificial

Ferramentas de inteligência artificial, incluindo o Codex, foram utilizadas como apoio à análise de requisitos, ao planejamento técnico, à implementação e revisão de código, à elaboração de testes e à documentação.

O uso dessas ferramentas foi acompanhado de critérios de aceite, verificações automatizadas e revisão das regras de negócio, especialmente nas operações de lances, carteira e auditoria.
