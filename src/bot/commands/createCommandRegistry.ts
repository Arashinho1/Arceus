import { PermissionFlagsBits } from "discord.js";
import type { PrefixCommand } from "./types.js";
import type { AppServices } from "../../services/createServices.js";

export function createCommandRegistry(services: AppServices): Map<string, PrefixCommand> {
  const commands: PrefixCommand[] = [
    {
      name: "ping",
      description: "Testa se o bot esta online.",
      async execute({ message }) {
        await message.reply("Pong.");
      }
    },
    {
      name: "equipe",
      description: "Mostra os Pokemon na equipe.",
      async execute({ message }) {
        const user = await services.user.ensureUser({
          discordId: message.author.id,
          username: message.author.username
        });

        const team = await services.prisma.playerPokemon.findMany({
          where: { userId: user.id, isInTeam: true, isReleased: false },
          orderBy: { teamSlot: "asc" },
          include: { species: true }
        });

        if (team.length === 0) {
          await message.reply("Sua equipe esta vazia.");
          return;
        }

        await message.reply(
          team
            .map((pokemon) => `#${pokemon.teamSlot} ${pokemon.species.name} Lv.${pokemon.level} - ${pokemon.moves.join(", ")}`)
            .join("\n")
        );
      }
    },
    {
      name: "box",
      description: "Mostra os primeiros Pokemon guardados na box.",
      async execute({ message }) {
        const user = await services.user.ensureUser({
          discordId: message.author.id,
          username: message.author.username
        });

        const boxed = await services.prisma.playerPokemon.findMany({
          where: { userId: user.id, isInTeam: false, isReleased: false },
          orderBy: [{ boxNumber: "asc" }, { boxSlot: "asc" }],
          take: 15,
          include: { species: true }
        });

        if (boxed.length === 0) {
          await message.reply("Sua box esta vazia.");
          return;
        }

        await message.reply(
          boxed
            .map((pokemon) => `Box ${pokemon.boxNumber}/${pokemon.boxSlot}: ${pokemon.species.name} Lv.${pokemon.level}`)
            .join("\n")
        );
      }
    },
    {
      name: "inventario",
      aliases: ["inv"],
      description: "Mostra os itens do jogador.",
      async execute({ message }) {
        const user = await services.user.ensureUser({
          discordId: message.author.id,
          username: message.author.username
        });

        const inventory = await services.prisma.inventory.findMany({
          where: { userId: user.id, quantity: { gt: 0 } },
          include: { item: true },
          orderBy: { item: { name: "asc" } }
        });

        if (inventory.length === 0) {
          await message.reply("Seu inventario esta vazio.");
          return;
        }

        await message.reply(inventory.map((entry) => `${entry.item.name}: ${entry.quantity}`).join("\n"));
      }
    },
    {
      name: "mapa",
      aliases: ["map"],
      description: "Administra mapas e spawns por canal.",
      async execute(context) {
        if (!context.message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await context.message.reply("Voce precisa da permissao Gerenciar Servidor para usar este comando.");
          return;
        }

        const subcommand = context.args[0]?.toLowerCase();
        if (subcommand === "criar") {
          await createMap(context);
          return;
        }

        if (subcommand === "spawn") {
          await addSpawn(context);
          return;
        }

        await context.message.reply(
          [
            `Uso: ${context.prefix}mapa criar #canal | Nome | bioma | min | max | descricao`,
            `Uso: ${context.prefix}mapa spawn #canal | pokemon_slug | peso | min | max | shinyChance`
          ].join("\n")
        );
      }
    }
  ];

  const registry = new Map<string, PrefixCommand>();
  for (const command of commands) {
    registry.set(command.name, command);
    for (const alias of command.aliases ?? []) {
      registry.set(alias, command);
    }
  }

  return registry;
}

async function createMap(context: Parameters<PrefixCommand["execute"]>[0]): Promise<void> {
  const raw = context.rawArgs.replace(/^criar\s+/i, "");
  const [channelRaw, name, biome, minRaw, maxRaw, description] = splitPipeArgs(raw);
  const channelId = parseChannelId(channelRaw);

  if (!context.message.guildId || !channelId || !name || !biome) {
    await context.message.reply(`Uso: ${context.prefix}mapa criar #canal | Rota 01 | grama | 1 | 8 | descricao`);
    return;
  }

  const map = await context.services.map.createMap({
    guildId: context.message.guildId,
    channelId,
    name,
    biome,
    description,
    recommendedMinLevel: Number(minRaw) || 1,
    recommendedMaxLevel: Number(maxRaw) || 5,
    createdByDiscordId: context.message.author.id
  });

  await context.message.reply(`Mapa ${map.name} registrado para <#${map.channelId}>.`);
}

async function addSpawn(context: Parameters<PrefixCommand["execute"]>[0]): Promise<void> {
  const raw = context.rawArgs.replace(/^spawn\s+/i, "");
  const [channelRaw, speciesSlug, weightRaw, minRaw, maxRaw, shinyChanceRaw] = splitPipeArgs(raw);
  const channelId = parseChannelId(channelRaw);

  if (!channelId || !speciesSlug) {
    await context.message.reply(`Uso: ${context.prefix}mapa spawn #canal | pidgey | 80 | 2 | 5 | 0.000244`);
    return;
  }

  const spawn = await context.services.map.addSpawn({
    channelId,
    speciesSlug,
    weight: Number(weightRaw) || 1,
    minLevel: Number(minRaw) || 1,
    maxLevel: Number(maxRaw) || Number(minRaw) || 5,
    shinyChance: shinyChanceRaw ? Number(shinyChanceRaw) : undefined
  });

  await context.message.reply(
    `${spawn.species.name} adicionado ao mapa <#${channelId}> com peso ${spawn.weight}, Lv.${spawn.minLevel}-${spawn.maxLevel}.`
  );
}

function splitPipeArgs(raw: string): string[] {
  return raw.split("|").map((part) => part.trim());
}

function parseChannelId(raw?: string): string | null {
  if (!raw) {
    return null;
  }

  const mention = raw.match(/^<#(\d+)>$/);
  return mention?.[1] ?? (raw.match(/^\d+$/) ? raw : null);
}
