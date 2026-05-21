# Deploy na Discloud

## Arquivos obrigatorios na raiz do zip

Ao abrir o zip, a Discloud precisa enxergar estes arquivos diretamente na raiz:

```text
discloud.config
.env
package.json
package-lock.json
tsconfig.json
prisma.config.ts
index.js
src/
prisma/
```

Nao pode ficar assim:

```text
Arceus/
  discloud.config
  index.js
```

Se o zip tiver uma pasta extra por cima, a Discloud pode dizer que o `discloud.config` ou o arquivo principal nao existe.

## Antes de subir

Rode:

```bash
npm run discloud:build
```

Depois confirme que existe:

```text
build/index.js
```

Voce tambem pode rodar:

```bash
npm run discloud:check
```

Essa checagem confirma se o arquivo `MAIN` existe e se a `.discloudignore` nao esta escondendo ele.

O `build/` fica fora do Git e nao precisa entrar no zip quando usamos build remoto da Discloud. O `discloud.config` usa:

```text
MAIN=index.js
BUILD=npm run discloud:build
START=npm run discloud:start
VLAN=true
HOSTNAME=arceusbot
```

Assim a Discloud valida um arquivo que ja existe no zip (`index.js`), roda o build, e so depois inicia o bootstrap, que carrega `build/index.js`.

## O que nao enviar

O `.discloudignore` ja remove:

```text
.git/
node_modules/
dist/
docs/
*.log
```

Se a Discloud retornar isto:

```text
ERRO: O arquivo principal build/index.js nao foi encontrado dentro do zip.
```

confira se o `discloud.config` que foi enviado ainda esta antigo. Ele deve ter `MAIN=index.js`, nao `MAIN=build/index.js`.

## Variaveis do .env

Para upload direto, o `.env` real pode ir junto no zip, na raiz:

```env
DISCORD_TOKEN="token-do-bot"
DATABASE_URL="url-postgres-de-producao"
BOT_PREFIX="."
NODE_ENV="production"
```

Nao envie `.env` para GitHub. Ele esta protegido no `.gitignore`.

Importante: o `BUILD` da Discloud pode rodar sem `.env`. Por isso o build do projeto nao depende do banco. O `DATABASE_URL` so precisa existir no `START`, quando roda `prisma db push`.

Se estiver usando GitHub Integration ou algum fluxo que nao envia `.env`, cadastre estas variaveis direto no painel/integração da Discloud:

```text
DISCORD_TOKEN
DATABASE_URL
BOT_PREFIX
NODE_ENV
```

O erro abaixo significa que a Discloud nao recebeu `DATABASE_URL`:

```text
Environment variable not found: DATABASE_URL
```

Nesse caso, o problema nao e mais o arquivo principal. E a variavel de banco ausente no ambiente da Discloud. Se voce usa GitHub Integration, cadastre `DATABASE_URL` nas variaveis do app do bot, porque o `.env` local nao vai junto no Git.

## Usando banco PostgreSQL por template da Discloud

Este bot usa Prisma com PostgreSQL. Para usar o banco criado pelo template da Discloud:

1. Abra `https://discloud.com/templates`.
2. Escolha o template de PostgreSQL.
3. Crie/hospede o template com um nome claro, por exemplo `arceus-db`.
4. Depois que o template estiver ativo, copie a connection string/URL de conexao do PostgreSQL.
5. No app do bot, defina essa URL como `DATABASE_URL`.

O formato esperado pelo Prisma e:

```env
DATABASE_URL="postgresql://usuario:senha@host:5432/banco?schema=public"
```

No seu banco da Discloud com hostname privado `arceusdb`, usuario `arceus` e database `arceus`, a URL fica neste formato:

```env
DATABASE_URL="postgresql://arceus:SENHA_DO_BANCO@arceusdb:5432/arceus?schema=public"
```

Repare em duas coisas:

- o host e `arceusdb`, igual ao hostname da VLAN do banco;
- o nome do banco no final tambem deve ser `arceus`, nao `postgres`, se `POSTGRES_DB=arceus`.

Se o painel do template mostrar dados separados, monte a URL assim:

```text
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
```

Exemplo ficticio:

```env
DATABASE_URL="postgresql://arceus:minha_senha@postgres.discloud.app:5432/arceus?schema=public"
```

Nao use `localhost` na Discloud. Dentro da Discloud, `localhost` seria o proprio container do bot, nao o banco gerenciado.

Se usar hostname privado/VLAN, o app do bot tambem precisa ter `VLAN=true` no `discloud.config`. Sem isso, o Prisma pode retornar:

```text
P1001: Can't reach database server at `arceusdb:5432`
```

Depois de configurar `DATABASE_URL`, envie/commit o bot novamente. No primeiro start, o comando `npm run discloud:start` roda:

```bash
prisma db push
prisma db seed
node index.js
```

Isso cria as tabelas do Prisma e popula os dados iniciais de Pokemon/itens.

## Comandos usados pela Discloud

Build:

```bash
npm run discloud:build
```

Start:

```bash
npm run discloud:start
```

O start roda `prisma db push`, roda o seed e inicia `node index.js`. Esse bootstrap carrega `build/index.js`, que foi criado pelo `BUILD`.
