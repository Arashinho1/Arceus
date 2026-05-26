import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import type { PrefixCommand } from "./types.js";
import type { AppServices } from "../../services/createServices.js";
import { buildPokedexPayload } from "../../ui/cards/pokedexCard.js";
import { buildPokemonInfoPayload } from "../../ui/cards/pokemonInfoCard.js";
import {
  buildTrainerBoxPayload,
  buildTrainerCardPayload,
  buildTrainerMapPayload,
  buildTrainerProfileFromMessage
} from "../../ui/menu/trainerMenu.js";
import { buildBattleTestEmbed } from "../../ui/embeds/battleTestEmbed.js";
import { replyOrUpdateBattleMessage } from "../../ui/embeds/battleMessage.js";

export function createCommandRegistry(services: AppServices): Map<string, PrefixCommand> {
  const commands: PrefixCommand[] = [
    {
      name: "ping",
      description: "Testa se o bot está online.",
      async execute({ message }) {
        await message.reply("Pong.");
      }
    },
    {
      name: "battletest",
      aliases: ["bt"],
      description: "Gera uma batalha aleatória para testar o fluxo de combate.",
      async execute({ message, services, args, prefix }) {
        const levelRange = parseBattleTestLevelRange(args);
        if (typeof levelRange === "string") {
          await message.reply(`${levelRange}\nUso: ${prefix}battletest [nivel] ou ${prefix}battletest [min] [max].`);
          return;
        }

        const result = await services.battleTest.createRandomBattle({
          discordId: message.author.id,
          username: message.author.username,
          minLevel: levelRange.minLevel,
          maxLevel: levelRange.maxLevel
        });

        await message.reply({ embeds: [buildBattleTestEmbed(result)] });
      }
    },
    {
      name: "batalhar",
      description: "Inicia modos de batalha narrativa.",
      async execute(context) {
        if (context.args[0]?.toLowerCase() === "teste") {
          await startNarrativeBattleTest(context, 1, `${context.prefix}batalhar teste [nivel]`);
          return;
        }

        await context.message.reply(`Uso: ${context.prefix}batalhar teste [nivel]`);
      }
    },
    {
      name: "batalha",
      aliases: ["duelo"],
      description: "Chama outro jogador para uma batalha narrativa.",
      async execute(context) {
        const subcommand = context.args[0]?.toLowerCase();
        if (subcommand === "teste") {
          await startNarrativeBattleTest(context, 1, `${context.prefix}batalha teste [nivel]`);
          return;
        }

        if (subcommand === "status") {
          const view = await context.services.battle.getActiveBattleView({
            discordId: context.message.author.id,
            username: context.message.author.username
          });
          if (!view) {
            await context.message.reply("Você não tem batalha ativa ou desafio pendente.");
            return;
          }

          await replyOrUpdateBattleMessage({ message: context.message, view });
          return;
        }

        if (subcommand === "log") {
          const log = await context.services.battle.getBattleLog({
            discordId: context.message.author.id,
            username: context.message.author.username
          });
          const view = await context.services.battle.getActiveBattleView({
            discordId: context.message.author.id,
            username: context.message.author.username
          });
          if (view) {
            await replyOrUpdateBattleMessage({ message: context.message, view, content: log });
            return;
          }

          await context.message.reply(log);
          return;
        }

        if (subcommand === "cancelar") {
          await context.message.reply(
            await context.services.battle.cancelBattle({
              discordId: context.message.author.id,
              username: context.message.author.username
            })
          );
          return;
        }

        if (subcommand === "resetar") {
          if (!context.message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
            await context.message.reply("Você precisa da permissão Gerenciar Servidor para resetar batalha de outro jogador.");
            return;
          }

          const target = context.message.mentions.users.first();
          if (!target) {
            await context.message.reply(`Uso: ${context.prefix}batalha resetar @jogador`);
            return;
          }

          await context.message.reply(
            await context.services.battle.resetBattleForUser({
              targetDiscordId: target.id,
              moderatorUsername: context.message.author.username
            })
          );
          return;
        }

        const { message, services, prefix } = context;
        const target = message.mentions.users.first();
        if (!target) {
          await message.reply(
            [
              `Uso: ${prefix}batalha @jogador`,
              `Uso: ${prefix}batalha teste [nivel]`,
              `Uso: ${prefix}batalha status`,
              `Uso: ${prefix}batalha log`,
              `Uso: ${prefix}batalha cancelar`,
              `Uso: ${prefix}batalha resetar @jogador`
            ].join("\n")
          );
          return;
        }

        await message.reply(
          await services.battle.challengePlayer({
            challengerDiscordId: message.author.id,
            challengerUsername: message.author.username,
            targetDiscordId: target.id,
            targetUsername: target.username
          })
        );
      }
    },
    {
      name: "aceitar",
      description: "Aceita um desafio de batalha pendente.",
      async execute({ message, services }) {
        const content = await services.battle.acceptChallenge({
            discordId: message.author.id,
            username: message.author.username
          });
        await replyBattleResult({ message, services }, content);
      }
    },
    {
      name: "recusar",
      description: "Recusa um desafio de batalha pendente.",
      async execute({ message, services }) {
        await message.reply(
          await services.battle.declineChallenge({
            discordId: message.author.id,
            username: message.author.username
          })
        );
      }
    },
    {
      name: "soltar",
      description: "Coloca um Pokémon da equipe em campo na batalha ativa.",
      async execute({ message, services, rawArgs, prefix }) {
        if (!rawArgs) {
          await message.reply(`Uso: ${prefix}soltar <slot|nome|ref>`);
          return;
        }

        const content = await services.battle.releasePokemon({
            discordId: message.author.id,
            username: message.author.username,
            query: rawArgs
          });
        await replyBattleResult({ message, services }, content);
      }
    },
    {
      name: "trocar",
      aliases: ["voltar"],
      description: "Volta o Pokémon ativo e coloca outro em campo.",
      async execute({ message, services, rawArgs, prefix }) {
        if (!rawArgs) {
          await message.reply(`Uso: ${prefix}trocar <slot|nome|ref>`);
          return;
        }

        const content = await services.battle.switchPokemon({
            discordId: message.author.id,
            username: message.author.username,
            query: rawArgs
          });
        await replyBattleResult({ message, services }, content);
      }
    },
    {
      name: "atacar",
      aliases: ["ataque"],
      description: "Usa um ataque aprendido pelo Pokémon em campo.",
      async execute({ message, services, rawArgs, prefix }) {
        const parsed = parseAttackInput(rawArgs);
        if (!parsed.moveQuery) {
          await message.reply(`Uso: ${prefix}atacar <ataque> | <narração opcional>`);
          return;
        }

        const content = await services.battle.attack({
            discordId: message.author.id,
            username: message.author.username,
            moveQuery: parsed.moveQuery,
            narration: parsed.narration
          });
        await replyBattleResult({ message, services }, content);
      }
    },
    {
      name: "passar",
      aliases: ["passarturno"],
      description: "Passa o turno na batalha ativa.",
      async execute({ message, services }) {
        const content = await services.battle.passTurn({
            discordId: message.author.id,
            username: message.author.username
          });
        await replyBattleResult({ message, services }, content);
      }
    },
    {
      name: "fugir",
      description: "Tenta fugir de batalha selvagem ou NPC.",
      async execute({ message, services }) {
        const content = await services.battle.flee({
            discordId: message.author.id,
            username: message.author.username
          });
        await replyBattleResult({ message, services }, content);
      }
    },
    {
      name: "usar",
      description: "Usa um item fora de batalha.",
      async execute({ message, services, rawArgs, prefix }) {
        const parsed = parseUseItemInput(rawArgs);
        if (!parsed) {
          await message.reply(`Uso: ${prefix}usar <item> <pokemon>`);
          return;
        }

        await message.reply(
          await services.battle.useItemOutsideBattle({
            discordId: message.author.id,
            username: message.author.username,
            itemQuery: parsed.itemQuery,
            pokemonQuery: parsed.pokemonQuery
          })
        );
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
      description: "Mostra os Pokémon na equipe.",
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
          await message.reply("Sua equipe está vazia.");
          return;
        }

        await message.reply({ embeds: team.map((pokemon) => buildPlayerPokemonEmbed(pokemon, "TEAM")) });
      }
    },
    {
      name: "pokedex",
      aliases: ["dex", "pokemon", "p"],
      description: "Mostra a National Dex ou uma Pokédex regional.",
      async execute({ message, services, rawArgs, prefix }) {
        await message.reply(await buildPokedexPayload(services, prefix, rawArgs));
      }
    },
    {
      name: "box",
      description: "Mostra a box de Pokémon em páginas.",
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
      description: "Mostra a ficha visual de um Pokémon pela ref.",
      async execute({ message, services, args, prefix }) {
        const ref = args[0];
        if (!ref) {
          await message.reply(`Uso: ${prefix}info <ref>. Pegue a ref em ${prefix}box ou ${prefix}menu.`);
          return;
        }

        await message.reply(await buildPokemonInfoPayload(services, buildTrainerProfileFromMessage(message), ref));
      }
    },
    {
      name: "favoritar",
      aliases: ["fav"],
      description: "Marca um Pokémon como favorito pela ref.",
      async execute({ message, services, args, prefix }) {
        const ref = args[0];
        if (!ref) {
          await message.reply(`Uso: ${prefix}favoritar <ref>. Pegue a ref em ${prefix}box ou ${prefix}menu.`);
          return;
        }

        await message.reply(await setPokemonFavorite(services, message.author.id, message.author.username, ref, true));
      }
    },
    {
      name: "desfavoritar",
      aliases: ["unfav"],
      description: "Remove o favorito de um Pokémon pela ref.",
      async execute({ message, services, args, prefix }) {
        const ref = args[0];
        if (!ref) {
          await message.reply(`Uso: ${prefix}desfavoritar <ref>. Pegue a ref em ${prefix}box ou ${prefix}menu.`);
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
          await message.reply("Seu inventário está vazio.");
          return;
        }

        await message.reply({ embeds: inventory.slice(0, 10).map(buildInventoryItemEmbed) });
      }
    },
    {
      name: "viajar",
      description: "Viaja para uma localização vizinha do mapa atual.",
      async execute({ message, services, rawArgs, prefix }) {
        const result = await services.travel.travel({
          guildId: message.guildId,
          channelId: message.channelId,
          discordId: message.author.id,
          username: message.author.username,
          destination: rawArgs,
          prefix
        });

        await message.reply(result.message);
      }
    },
    {
      name: "fly",
      description: "Usa Fly para viajar direto para uma cidade configurada.",
      async execute({ message, services, rawArgs, prefix }) {
        const result = await services.travel.fly({
          guildId: message.guildId,
          channelId: message.channelId,
          discordId: message.author.id,
          username: message.author.username,
          destination: rawArgs,
          prefix
        });

        await message.reply(result.message);
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
          await context.message.reply("Você precisa da permissão Gerenciar Servidor para usar este comando.");
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
            `Uso: ${context.prefix}mapa criar #canal | Nome | bioma | min | max | descrição`,
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

async function startNarrativeBattleTest(
  context: Parameters<PrefixCommand["execute"]>[0],
  levelArgIndex: number,
  usage: string
): Promise<void> {
  const parsedLevel = parseOptionalBattleLevel(context.args[levelArgIndex]);
  if (typeof parsedLevel === "string") {
    await context.message.reply(`${parsedLevel}\nUso: ${usage}`);
    return;
  }

  try {
    const result = await context.services.battle.startTestBattle({
      discordId: context.message.author.id,
      username: context.message.author.username,
      ...(typeof parsedLevel === "number" ? { level: parsedLevel } : {})
    });
    const view = await context.services.battle.getBattleViewById(result.battle.id);
    if (view) {
      await replyOrUpdateBattleMessage({ message: context.message, view, content: result.message });
      return;
    }

    await context.message.reply(result.message);
  } catch (error) {
    await context.message.reply(error instanceof Error ? error.message : "Não foi possível iniciar a batalha teste.");
  }
}

async function replyBattleResult(
  input: Pick<Parameters<PrefixCommand["execute"]>[0], "message" | "services">,
  content: string
): Promise<void> {
  if (content.startsWith("Você não está em uma batalha ativa.")) {
    await input.message.reply(content);
    return;
  }

  const view = await input.services.battle.getLatestBattleView({
    discordId: input.message.author.id,
    username: input.message.author.username
  });
  if (!view) {
    await input.message.reply(content);
    return;
  }

  await replyOrUpdateBattleMessage({ message: input.message, view, content });
}

async function createMap(context: Parameters<PrefixCommand["execute"]>[0]): Promise<void> {
  const raw = context.rawArgs.replace(/^criar\s+/i, "");
  const [channelRaw, name, biome, minRaw, maxRaw, description] = splitPipeArgs(raw);
  const channelId = parseChannelId(channelRaw);

  if (!context.message.guildId || !channelId || !name || !biome) {
    await context.message.reply(`Uso: ${context.prefix}mapa criar #canal | Rota 01 | grama | 1 | 8 | descrição`);
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

function parseBattleTestLevelRange(args: string[]): { minLevel: number; maxLevel: number } | string {
  if (args.length === 0) {
    return { minLevel: 5, maxLevel: 20 };
  }

  const joinedRange = args[0]?.match(/^(\d+)-(\d+)$/);
  const minRaw = joinedRange?.[1] ?? args[0];
  const maxRaw = joinedRange?.[2] ?? args[1] ?? args[0];
  const minLevel = Number(minRaw);
  const maxLevel = Number(maxRaw);

  if (!Number.isInteger(minLevel) || !Number.isInteger(maxLevel)) {
    return "Os níveis precisam ser números inteiros.";
  }

  if (minLevel < 1 || maxLevel > 100 || minLevel > maxLevel) {
    return "Use níveis entre 1 e 100, com o mínimo menor ou igual ao máximo.";
  }

  return { minLevel, maxLevel };
}

function parseOptionalBattleLevel(raw: string | undefined): number | undefined | string {
  if (!raw) {
    return undefined;
  }

  const level = Number(raw);
  if (!Number.isInteger(level) || level < 1 || level > 100) {
    return "O nível da batalha teste precisa ser um número inteiro entre 1 e 100.";
  }

  return level;
}

function parseAttackInput(rawArgs: string): { moveQuery: string; narration?: string } {
  const [moveQuery = "", narration] = rawArgs.split("|").map((part) => part.trim());
  return {
    moveQuery,
    ...(narration ? { narration } : {})
  };
}

function parseUseItemInput(rawArgs: string): { itemQuery: string; pokemonQuery: string } | null {
  const [itemQuery, ...pokemonParts] = rawArgs.trim().split(/\s+/);
  const pokemonQuery = pokemonParts.join(" ").trim();
  if (!itemQuery || !pokemonQuery) {
    return null;
  }

  return { itemQuery, pokemonQuery };
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
    return "Use uma ref com pelo menos 4 caracteres. Pegue a ref em .box ou .menu.";
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
    return "Não encontrei nenhum Pokémon seu com essa ref.";
  }

  if (matches.length > 1) {
    return "Essa ref encontrou mais de um Pokémon. Use mais caracteres do ID exibido em .box ou .menu.";
  }

  const pokemon = matches[0];
  if (!pokemon) {
    return "Não encontrei nenhum Pokémon seu com essa ref.";
  }

  if (pokemon.isFavorite === isFavorite) {
    return isFavorite
      ? `${pokemon.species.name} já está marcado como favorito.`
      : `${pokemon.species.name} já não está marcado como favorito.`;
  }

  await services.prisma.playerPokemon.update({
    where: { id: pokemon.id },
    data: { isFavorite }
  });

  return isFavorite
    ? `${pokemon.species.name} agora está marcado como favorito.`
    : `${pokemon.species.name} não está mais marcado como favorito.`;
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
