import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import type { PrefixCommand } from "./types.js";
import type { AppServices } from "../../services/createServices.js";
import { buildPokemonInfoPayload } from "../../ui/cards/pokemonInfoCard.js";
import {
  buildTrainerBoxPayload,
  buildTrainerCardPayload,
  buildTrainerMapPayload,
  buildTrainerPokemonListPayload,
  buildTrainerProfileFromMessage
} from "../../ui/menu/trainerMenu.js";

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
      name: "menu",
      aliases: ["cartao"],
      description: "Mostra o menu principal do treinador.",
      async execute({ message, services }) {
        await message.reply(await buildTrainerCardPayload(services, buildTrainerProfileFromMessage(message)));
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

        await message.reply({ embeds: team.map((pokemon) => buildPlayerPokemonEmbed(pokemon, "TEAM")) });
      }
    },
    {
      name: "pokemon",
      aliases: ["p"],
      description: "Mostra a colecao de Pokemon do jogador.",
      async execute({ message, services, args }) {
        await message.reply(
          await buildTrainerPokemonListPayload(
            services,
            buildTrainerProfileFromMessage(message),
            parseListPage(args[0])
          )
        );
      }
    },
    {
      name: "box",
      description: "Mostra a box de Pokemon em paginas.",
      async execute({ message, services, args }) {
        await message.reply(
          await buildTrainerBoxPayload(
            services,
            buildTrainerProfileFromMessage(message),
            parseListPage(args[0])
          )
        );
      }
    },
    {
      name: "info",
      description: "Mostra a ficha visual de um Pokemon pela ref.",
      async execute({ message, services, args, prefix }) {
        const ref = args[0];
        if (!ref) {
          await message.reply(`Uso: ${prefix}info <ref>. Pegue a ref em ${prefix}pokemon ou ${prefix}box.`);
          return;
        }

        await message.reply(await buildPokemonInfoPayload(services, buildTrainerProfileFromMessage(message), ref));
      }
    },
    {
      name: "favoritar",
      aliases: ["fav"],
      description: "Marca um Pokemon como favorito pela ref.",
      async execute({ message, services, args, prefix }) {
        const ref = args[0];
        if (!ref) {
          await message.reply(`Uso: ${prefix}favoritar <ref>. Pegue a ref em ${prefix}pokemon ou ${prefix}box.`);
          return;
        }

        await message.reply(await setPokemonFavorite(services, message.author.id, message.author.username, ref, true));
      }
    },
    {
      name: "desfavoritar",
      aliases: ["unfav"],
      description: "Remove o favorito de um Pokemon pela ref.",
      async execute({ message, services, args, prefix }) {
        const ref = args[0];
        if (!ref) {
          await message.reply(`Uso: ${prefix}desfavoritar <ref>. Pegue a ref em ${prefix}pokemon ou ${prefix}box.`);
          return;
        }

        await message.reply(await setPokemonFavorite(services, message.author.id, message.author.username, ref, false));
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

        await message.reply({ embeds: inventory.slice(0, 10).map(buildInventoryItemEmbed) });
      }
    },
    {
      name: "mapa",
      aliases: ["map"],
      description: "Mostra o mapa de Kanto ou administra mapas por canal.",
      async execute(context) {
        const subcommand = context.args[0]?.toLowerCase();
        if (!subcommand) {
          await context.message.reply(
            await buildTrainerMapPayload(
              context.services,
              buildTrainerProfileFromMessage(context.message),
              context.message.channelId
            )
          );
          return;
        }

        if (!context.message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await context.message.reply("Voce precisa da permissao Gerenciar Servidor para usar este comando.");
          return;
        }

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
            `Uso: ${context.prefix}mapa`,
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

function parseListPage(raw: string | undefined): number {
  const page = Number(raw);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

async function setPokemonFavorite(
  services: AppServices,
  discordId: string,
  username: string,
  ref: string,
  isFavorite: boolean
): Promise<string> {
  const normalizedRef = ref.trim().toLowerCase();
  if (normalizedRef.length < 4) {
    return "Use uma ref com pelo menos 4 caracteres. Pegue a ref em .pokemon ou .box.";
  }

  const user = await services.user.ensureUser({ discordId, username });
  const matches = await services.prisma.playerPokemon.findMany({
    where: {
      userId: user.id,
      isReleased: false,
      id: { startsWith: normalizedRef }
    },
    include: {
      species: {
        select: { name: true }
      }
    },
    orderBy: { createdAt: "asc" },
    take: 3
  });

  if (matches.length === 0) {
    return "Nao encontrei nenhum Pokemon seu com essa ref.";
  }

  if (matches.length > 1) {
    return "Essa ref encontrou mais de um Pokemon. Use mais caracteres do ID exibido em .pokemon ou .box.";
  }

  const pokemon = matches[0];
  if (!pokemon) {
    return "Nao encontrei nenhum Pokemon seu com essa ref.";
  }

  if (pokemon.isFavorite === isFavorite) {
    return isFavorite
      ? `${pokemon.species.name} ja esta marcado como favorito.`
      : `${pokemon.species.name} ja nao esta marcado como favorito.`;
  }

  await services.prisma.playerPokemon.update({
    where: { id: pokemon.id },
    data: { isFavorite }
  });

  return isFavorite
    ? `${pokemon.species.name} agora esta marcado como favorito.`
    : `${pokemon.species.name} nao esta mais marcado como favorito.`;
}

function parseChannelId(raw?: string): string | null {
  if (!raw) {
    return null;
  }

  const mention = raw.match(/^<#(\d+)>$/);
  return mention?.[1] ?? (raw.match(/^\d+$/) ? raw : null);
}

type PlayerPokemonWithSpecies = Awaited<
  ReturnType<AppServices["prisma"]["playerPokemon"]["findMany"]>
>[number] & {
  species: {
    name: string;
    types: string[];
    spriteUrl: string | null;
    shinySpriteUrl: string | null;
    artworkUrl: string | null;
  };
};

type InventoryWithItem = Awaited<ReturnType<AppServices["prisma"]["inventory"]["findMany"]>>[number] & {
  item: {
    name: string;
    category: string;
    spriteUrl: string | null;
  };
};

function buildPlayerPokemonEmbed(pokemon: PlayerPokemonWithSpecies, location: "TEAM" | "BOX"): EmbedBuilder {
  const titlePrefix = location === "TEAM" ? `#${pokemon.teamSlot ?? "?"}` : `Box ${pokemon.boxNumber}/${pokemon.boxSlot ?? "?"}`;
  const spriteUrl = pokemon.shiny ? pokemon.species.shinySpriteUrl ?? pokemon.species.spriteUrl : pokemon.species.spriteUrl;
  const embed = new EmbedBuilder()
    .setColor(pokemon.shiny ? 0xf7d154 : 0x6aa6ff)
    .setTitle(`${titlePrefix} - ${pokemon.species.name}${pokemon.shiny ? " Shiny" : ""}`)
    .setDescription(`Lv.${pokemon.level} | ${pokemon.species.types.join(" / ") || "Sem tipo"}`)
    .addFields(
      { name: "HP", value: `${pokemon.currentHp}/${pokemon.maxHp}`, inline: true },
      { name: "Nature", value: pokemon.nature, inline: true },
      { name: "Ability", value: pokemon.ability, inline: true },
      { name: "Moves", value: pokemon.moves.join(", ") || "Nenhum", inline: false }
    )
    .setFooter({ text: `ID ${pokemon.id}` });

  if (spriteUrl) {
    embed.setThumbnail(spriteUrl);
  }

  return embed;
}

function buildInventoryItemEmbed(entry: InventoryWithItem): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xffcc66)
    .setTitle(entry.item.name)
    .setDescription(`Quantidade: ${entry.quantity}`)
    .addFields({ name: "Categoria", value: entry.item.category, inline: true });

  if (entry.item.spriteUrl) {
    embed.setThumbnail(entry.item.spriteUrl);
  }

  return embed;
}
