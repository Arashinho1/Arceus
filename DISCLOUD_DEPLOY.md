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

Para upload direto, o `.env` real deve ir junto no zip, na raiz:

```env
DISCORD_TOKEN="token-do-bot"
DATABASE_URL="url-postgres-de-producao"
BOT_PREFIX="."
NODE_ENV="production"
```

Nao envie `.env` para GitHub. Ele esta protegido no `.gitignore`.

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
