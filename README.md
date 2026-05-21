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

## Arquitetura

Veja [docs/mvp-blueprint.md](docs/mvp-blueprint.md) para a arquitetura, schema, comandos, fluxos de spawn/captura, roadmap e pontos de integração futura com Pokemon Showdown.
