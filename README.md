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

Para testar o fluxo de batalha, use `.battletest`, `.battletest 25` ou `.battletest 5 20`. O comando sorteia dois Pokemon, simula um combate local e mostra o resumo mecânico do resultado.

O combate principal é narrativo por turnos. Use `.batalha @jogador`, `.aceitar`, `.soltar <slot|nome>`, `.atacar <ataque> | <narração>`, `.trocar <slot|nome>`, `.passar` e `.fugir` para testar o MVP.

O motor já calcula categoria física/especial/status, precisão, dano, crítico, efetividade, burn, paralysis, sleep, poison e habilidades iniciais como Blaze, Torrent, Overgrow, Static, Keen Eye e Run Away.

Ao vencer batalhas selvagens ou NPCs, o bot concede XP, moedas, EVs, level up, golpes aprendidos e evolução por nível quando a espécie evoluída estiver cadastrada.

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

Antes de subir, rode `npm run discloud:check`. O `MAIN` da Discloud aponta para `index.js`, e o build remoto cria `build/index.js` antes do start.

Se a Discloud retornar `O arquivo principal build/index.js não foi encontrado dentro do zip`, o arquivo `discloud.config` enviado ainda está antigo. Ele deve conter `MAIN=index.js`.

Veja o passo a passo em [DISCLOUD_DEPLOY.md](DISCLOUD_DEPLOY.md).

## Arquitetura

Veja [docs/mvp-blueprint.md](docs/mvp-blueprint.md) para a arquitetura, schema, comandos, fluxos de spawn/captura, roadmap e batalha narrativa.
