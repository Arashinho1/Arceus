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
build/index.js
src/
prisma/
```

Nao pode ficar assim:

```text
Arceus/
  discloud.config
  build/index.js
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

O `build/` fica fora do Git, mas precisa entrar no zip da Discloud porque `discloud.config` usa:

```text
MAIN=build/index.js
```

## O que nao enviar

O `.discloudignore` ja remove:

```text
.git/
node_modules/
dist/
docs/
*.log
```

Nao coloque `build/` na `.discloudignore`, senao a Discloud vai retornar:

```text
ERRO: O arquivo principal build/index.js nao foi encontrado dentro do zip.
```

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

O start roda `prisma db push`, roda o seed e inicia `node build/index.js`.
