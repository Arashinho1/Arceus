# Arceus RPG Bot

Bot de RPG Pokemon para Discord, focado em texto, com canais funcionando como mapas do jogo.

## Stack

- Node.js + TypeScript
- discord.js
- PostgreSQL
- Prisma ORM
- Redis opcional para cooldown/cache
- Docker para ambiente local

## Comandos

O MVP usa prefix commands com `.`. A arquitetura separa o handler do Discord dos serviços de domínio, então slash commands podem ser adicionados depois sem reescrever as regras do RPG.

## Rodando localmente

```bash
npm install
docker compose up -d
Copy-Item .env.example .env
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

No portal do Discord, ative o `Message Content Intent`, porque comandos com prefixo e spawns por mensagem dependem do conteúdo das mensagens.

## Deploy na Discloud

Os arquivos de hospedagem estão prontos na raiz:

- `discloud.config`
- `.discloudignore`
- `.env.example`
- `DISCLOUD_DEPLOY.md`

Para upload direto, mantenha o `.env` real na raiz junto do `discloud.config`. A Discloud usa esse arquivo para carregar `DISCORD_TOKEN`, `DATABASE_URL` e demais variáveis. O `.env` continua ignorado pelo Git.

Antes de subir, rode `npm run discloud:build` e confirme que `build/index.js` existe. O `build/` nao vai para o Git, mas precisa ir no zip enviado para a Discloud.

Se a Discloud retornar `O arquivo principal build/index.js não foi encontrado dentro do zip`, o zip foi criado sem a pasta `build/` ou você selecionou a raiz errada.

Veja o passo a passo em [DISCLOUD_DEPLOY.md](DISCLOUD_DEPLOY.md).

## Arquitetura

Veja [docs/mvp-blueprint.md](docs/mvp-blueprint.md) para a arquitetura, schema, comandos, fluxos de spawn/captura, roadmap e pontos de integração futura com Pokemon Showdown.
