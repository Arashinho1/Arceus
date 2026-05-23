import { ItemCategory, Prisma, type Inventory, type Item, type PlayerPokemon, type PokemonSpecies, type User } from "@prisma/client";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type Interaction,
  type Message,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
  type WebhookMessageEditOptions
} from "discord.js";
import sharp from "sharp";
import type { AppServices } from "../../services/createServices.js";
import { fetchImageDataUri } from "../assets/imageCache.js";
import { buildKantoMapCardPayload } from "../cards/kantoMapCard.js";

const MENU_SCOPE = "trainer-menu";
const CARD_FILE_NAME = "trainer-card.png";
const ITEM_FILE_NAME = "item-card.png";
const CARD_WIDTH = 1536;
const CARD_HEIGHT = 1024;
const ITEM_CARD_WIDTH = 920;
const ITEM_CARD_HEIGHT = 460;
const MAX_INVENTORY_BUTTONS = 20;
const POKEMON_LIST_PAGE_SIZE = 20;

type MenuAction = "card" | "bag" | "team" | "pokemon" | "box" | "map" | "view" | "use" | "target" | "close";
type MenuTab = "card" | "bag" | "team" | "pokemon" | "box" | "map";
type MenuComponentRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

export type TrainerMenuProfile = {
  discordId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
};

type TeamPokemon = PlayerPokemon & {
  species: Pick<PokemonSpecies, "name" | "spriteUrl" | "shinySpriteUrl" | "artworkUrl" | "baseStats" | "evolutions">;
};

type InventoryEntry = Inventory & {
  item: Pick<Item, "id" | "slug" | "name" | "category" | "spriteUrl" | "data">;
};

type CollectionPokemon = PlayerPokemon & {
  species: Pick<PokemonSpecies, "name" | "types" | "spriteUrl" | "shinySpriteUrl">;
};

type TrainerMenuPayload = {
  content?: string;
  embeds: EmbedBuilder[];
  files?: AttachmentBuilder[];
  components: MenuComponentRow[];
};

type ParsedCustomId = {
  ownerDiscordId: string;
  action: MenuAction;
  subject?: string;
};

type UseItemResult = {
  ok: boolean;
  message: string;
};

type StatTable = {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
};

type ItemEvolution = {
  to: string;
  method: string;
  item?: string;
};

export function isTrainerMenuInteraction(interaction: Interaction): boolean {
  return (
    (interaction.isButton() || interaction.isStringSelectMenu()) &&
    interaction.customId.startsWith(`${MENU_SCOPE}:`)
  );
}

export function buildTrainerProfileFromMessage(message: Message): TrainerMenuProfile {
  return {
    discordId: message.author.id,
    username: message.author.username,
    displayName: message.member?.displayName ?? message.author.username,
    avatarUrl: message.member?.displayAvatarURL({ extension: "png", size: 256, forceStatic: true }) ??
      message.author.displayAvatarURL({ extension: "png", size: 256, forceStatic: true })
  };
}

export function buildTrainerProfileFromInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction
): TrainerMenuProfile {
  const cachedMember = interaction.inCachedGuild() ? interaction.member : null;

  return {
    discordId: interaction.user.id,
    username: interaction.user.username,
    displayName: cachedMember?.displayName ?? interaction.user.globalName ?? interaction.user.username,
    avatarUrl: cachedMember?.displayAvatarURL({ extension: "png", size: 256, forceStatic: true }) ??
      interaction.user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true })
  };
}

export async function buildTrainerCardPayload(
  services: AppServices,
  profile: TrainerMenuProfile
): Promise<TrainerMenuPayload> {
  const user = await services.user.ensureUser({
    discordId: profile.discordId,
    username: profile.username
  });

  const [team, capturedCount] = await Promise.all([
    loadTeam(services, user.id),
    services.prisma.playerPokemon.count({
      where: { userId: user.id, isReleased: false }
    })
  ]);

  const image = await renderTrainerCardPng({
    user,
    team,
    capturedCount,
    profile
  });

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x2f80ed)
        .setImage(`attachment://${CARD_FILE_NAME}`)
    ],
    files: [new AttachmentBuilder(image, { name: CARD_FILE_NAME })],
    components: [buildNavRow(profile.discordId, "card")]
  };
}

export async function buildTrainerInventoryPayload(
  services: AppServices,
  profile: TrainerMenuProfile,
  content?: string
): Promise<TrainerMenuPayload> {
  const user = await services.user.ensureUser({
    discordId: profile.discordId,
    username: profile.username
  });
  const inventory = await loadInventory(services, user.id);
  const visibleItems = inventory.slice(0, MAX_INVENTORY_BUTTONS);
  const embed = new EmbedBuilder()
    .setColor(0x4a90e2)
    .setTitle("Mochila")
    .setDescription(
      inventory.length === 0
        ? "Sua mochila esta vazia."
        : "Itens atuais. Use os botoes Ver para abrir os detalhes de cada item."
    );

  if (visibleItems.length > 0) {
    embed.addFields(
      visibleItems.map((entry, index) => ({
        name: `${index + 1}. ${entry.item.name}`,
        value: `Qtd: ${entry.quantity} | ${formatItemCategory(entry.item.category)}`,
        inline: true
      }))
    );
  }

  if (inventory.length > MAX_INVENTORY_BUTTONS) {
    embed.setFooter({ text: `Mostrando ${MAX_INVENTORY_BUTTONS} de ${inventory.length} itens.` });
  }

  return {
    content,
    embeds: [embed],
    components: [buildNavRow(profile.discordId, "bag"), ...buildInventoryItemRows(profile.discordId, visibleItems)]
  };
}

export async function buildTrainerPokemonListPayload(
  services: AppServices,
  profile: TrainerMenuProfile,
  page = 1
): Promise<TrainerMenuPayload> {
  return buildTrainerPokemonCollectionPayload(services, profile, "pokemon", page);
}

export async function buildTrainerTeamPayload(
  services: AppServices,
  profile: TrainerMenuProfile
): Promise<TrainerMenuPayload> {
  const user = await services.user.ensureUser({
    discordId: profile.discordId,
    username: profile.username
  });
  const team = await services.prisma.playerPokemon.findMany({
    where: { userId: user.id, isInTeam: true, isReleased: false },
    orderBy: { teamSlot: "asc" },
    take: 6,
    include: {
      species: {
        select: {
          name: true,
          types: true,
          spriteUrl: true,
          shinySpriteUrl: true
        }
      }
    }
  });

  return {
    embeds: [buildPokemonTeamEmbed(team)],
    components: [buildNavRow(profile.discordId, "team")]
  };
}

export async function buildTrainerBoxPayload(
  services: AppServices,
  profile: TrainerMenuProfile,
  page = 1
): Promise<TrainerMenuPayload> {
  return buildTrainerPokemonCollectionPayload(services, profile, "box", page);
}

export async function buildTrainerMapPayload(
  services: AppServices,
  profile: TrainerMenuProfile,
  channelId?: string | null
): Promise<TrainerMenuPayload> {
  const currentMap = channelId
    ? await services.prisma.gameMap.findUnique({
        where: { channelId },
        select: {
          name: true
        }
      })
    : null;
  const payload = await buildKantoMapCardPayload({
    currentLocationName: currentMap?.name ?? null
  });

  return {
    embeds: payload.embeds,
    files: payload.files,
    components: [buildNavRow(profile.discordId, "map")]
  };
}

export async function handleTrainerMenuInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  services: AppServices
): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) {
    await interaction.reply({ content: "Esse menu nao e mais valido.", ephemeral: true });
    return;
  }

  if (parsed.ownerDiscordId !== interaction.user.id) {
    await interaction.reply({ content: "Esse menu pertence a outro treinador.", ephemeral: true });
    return;
  }

  await interaction.deferUpdate();

  const profile = buildTrainerProfileFromInteraction(interaction);

  if (parsed.action === "card") {
    await editTrainerMenuReply(interaction, await buildTrainerCardPayload(services, profile));
    return;
  }

  if (parsed.action === "bag") {
    await editTrainerMenuReply(interaction, await buildTrainerInventoryPayload(services, profile));
    return;
  }

  if (parsed.action === "team") {
    await editTrainerMenuReply(interaction, await buildTrainerTeamPayload(services, profile));
    return;
  }

  if (parsed.action === "pokemon") {
    await editTrainerMenuReply(interaction, await buildTrainerPokemonListPayload(services, profile, parsePage(parsed.subject)));
    return;
  }

  if (parsed.action === "box") {
    await editTrainerMenuReply(interaction, await buildTrainerBoxPayload(services, profile, parsePage(parsed.subject)));
    return;
  }

  if (parsed.action === "map") {
    await editTrainerMenuReply(interaction, await buildTrainerMapPayload(services, profile, interaction.channelId));
    return;
  }

  if (parsed.action === "close") {
    await interaction.editReply({
      content: "Menu fechado.",
      embeds: [],
      components: [],
      attachments: []
    });
    return;
  }

  if (!parsed.subject) {
    await interaction.followUp({ content: "Nao encontrei o item desse botao.", ephemeral: true });
    return;
  }

  if (parsed.action === "view") {
    const payload = await buildItemDetailPayload(services, profile, parsed.subject);
    await editTrainerMenuReply(interaction, payload);
    return;
  }

  if (parsed.action === "use") {
    const targetPayload = await buildPokemonTargetPayload(services, profile, parsed.subject);
    if (!targetPayload.ok) {
      await interaction.followUp({ content: targetPayload.message, ephemeral: true });
      return;
    }

    await editTrainerMenuReply(interaction, targetPayload.payload);
    return;
  }

  if (parsed.action === "target" && interaction.isStringSelectMenu()) {
    const pokemonId = interaction.values[0];
    if (!pokemonId) {
      await interaction.followUp({ content: "Escolha um Pokemon para usar o item.", ephemeral: true });
      return;
    }

    const result = await useInventoryItem(services, profile.discordId, profile.username, parsed.subject, pokemonId);
    await editTrainerMenuReply(interaction, await buildTrainerInventoryPayload(services, profile, result.message));
  }
}

async function editTrainerMenuReply(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  payload: TrainerMenuPayload
): Promise<void> {
  const options: WebhookMessageEditOptions = {
    content: payload.content ?? null,
    embeds: payload.embeds,
    components: payload.components,
    files: payload.files,
    attachments: []
  };

  await interaction.editReply(options);
}

async function buildTrainerPokemonCollectionPayload(
  services: AppServices,
  profile: TrainerMenuProfile,
  mode: "pokemon" | "box",
  page: number
): Promise<TrainerMenuPayload> {
  const user = await services.user.ensureUser({
    discordId: profile.discordId,
    username: profile.username
  });
  const where = {
    userId: user.id,
    isReleased: false,
    ...(mode === "box" ? { isInTeam: false } : {})
  };
  const total = await services.prisma.playerPokemon.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / POKEMON_LIST_PAGE_SIZE));
  const currentPage = clampPage(page, totalPages);
  const pokemon = total === 0
    ? []
    : await services.prisma.playerPokemon.findMany({
        where,
        orderBy: mode === "box"
          ? [{ boxNumber: "asc" }, { boxSlot: "asc" }, { createdAt: "asc" }]
          : [{ isInTeam: "desc" }, { teamSlot: "asc" }, { boxNumber: "asc" }, { boxSlot: "asc" }, { createdAt: "asc" }],
        skip: (currentPage - 1) * POKEMON_LIST_PAGE_SIZE,
        take: POKEMON_LIST_PAGE_SIZE,
        include: {
          species: {
            select: {
              name: true,
              types: true,
              spriteUrl: true,
              shinySpriteUrl: true
            }
          }
        }
      });
  const activeTab: MenuTab = mode === "box" ? "box" : "pokemon";
  const components = [buildNavRow(profile.discordId, activeTab)];

  if (totalPages > 1) {
    components.push(buildPokemonPaginationRow(profile.discordId, activeTab, currentPage, totalPages));
  }

  return {
    embeds: [buildPokemonCollectionEmbed(mode, pokemon, currentPage, totalPages, total)],
    components
  };
}

async function buildItemDetailPayload(
  services: AppServices,
  profile: TrainerMenuProfile,
  itemId: string
): Promise<TrainerMenuPayload> {
  const user = await services.user.ensureUser({
    discordId: profile.discordId,
    username: profile.username
  });
  const entry = await services.prisma.inventory.findFirst({
    where: { userId: user.id, itemId, quantity: { gt: 0 } },
    include: { item: true }
  });

  if (!entry) {
    return buildTrainerInventoryPayload(services, profile, "Voce nao possui mais esse item.");
  }

  const image = await renderItemCardPng(entry);

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x4a90e2)
        .setImage(`attachment://${ITEM_FILE_NAME}`)
    ],
    files: [new AttachmentBuilder(image, { name: ITEM_FILE_NAME })],
    components: [buildItemActionRow(profile.discordId, entry.item)]
  };
}

async function buildPokemonTargetPayload(
  services: AppServices,
  profile: TrainerMenuProfile,
  itemId: string
): Promise<{ ok: true; payload: TrainerMenuPayload } | { ok: false; message: string }> {
  const user = await services.user.ensureUser({
    discordId: profile.discordId,
    username: profile.username
  });
  const entry = await services.prisma.inventory.findFirst({
    where: { userId: user.id, itemId, quantity: { gt: 0 } },
    include: { item: true }
  });

  if (!entry) {
    return { ok: false, message: "Voce nao possui mais esse item." };
  }

  if (!isPokemonTargetItem(entry.item.category)) {
    return { ok: false, message: `${entry.item.name} nao pode ser usado diretamente em um Pokemon.` };
  }

  const team = await loadTeam(services, user.id);
  if (team.length === 0) {
    return { ok: false, message: "Sua equipe esta vazia." };
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(customId(profile.discordId, "target", itemId))
    .setPlaceholder(`Usar ${entry.item.name} em qual Pokemon?`)
    .addOptions(
      team.map((pokemon) => ({
        label: formatPokemonName(pokemon).slice(0, 100),
        description: `Lv.${pokemon.level} | HP ${pokemon.currentHp}/${pokemon.maxHp}`.slice(0, 100),
        value: pokemon.id
      }))
    );

  const embed = new EmbedBuilder()
    .setColor(0x4a90e2)
    .setTitle(`Usar ${entry.item.name}`)
    .setDescription("Escolha um Pokemon da sua equipe.");

  return {
    ok: true,
    payload: {
      embeds: [embed],
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select),
        buildBackToBagRow(profile.discordId)
      ]
    }
  };
}

async function loadTeam(services: AppServices, userId: string): Promise<TeamPokemon[]> {
  return services.prisma.playerPokemon.findMany({
    where: { userId, isInTeam: true, isReleased: false },
    orderBy: { teamSlot: "asc" },
    take: 6,
    include: {
      species: {
        select: {
          name: true,
          spriteUrl: true,
          shinySpriteUrl: true,
          artworkUrl: true,
          baseStats: true,
          evolutions: true
        }
      }
    }
  });
}

async function loadInventory(services: AppServices, userId: string): Promise<InventoryEntry[]> {
  return services.prisma.inventory.findMany({
    where: { userId, quantity: { gt: 0 } },
    include: {
      item: {
        select: {
          id: true,
          slug: true,
          name: true,
          category: true,
          spriteUrl: true,
          data: true
        }
      }
    },
    orderBy: { item: { name: "asc" } }
  });
}

async function useInventoryItem(
  services: AppServices,
  discordId: string,
  username: string,
  itemId: string,
  pokemonId: string
): Promise<UseItemResult> {
  return services.prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { discordId },
      update: { username },
      create: { discordId, username }
    });

    const entry = await tx.inventory.findFirst({
      where: { userId: user.id, itemId, quantity: { gt: 0 } },
      include: { item: true }
    });

    if (!entry) {
      return { ok: false, message: "Voce nao possui mais esse item." };
    }

    const pokemon = await tx.playerPokemon.findFirst({
      where: { id: pokemonId, userId: user.id, isReleased: false },
      include: { species: true }
    });

    if (!pokemon) {
      return { ok: false, message: "Esse Pokemon nao esta com voce." };
    }

    if (entry.item.category === ItemCategory.HEALING) {
      return useHealingItem(tx, entry, pokemon);
    }

    if (entry.item.category === ItemCategory.XP) {
      return useXpItem(tx, entry, pokemon);
    }

    if (entry.item.category === ItemCategory.EVOLUTION) {
      return useEvolutionItem(tx, entry, pokemon);
    }

    return { ok: false, message: `${entry.item.name} nao pode ser usado diretamente em um Pokemon.` };
  });
}

async function useHealingItem(
  tx: Prisma.TransactionClient,
  entry: InventoryEntry,
  pokemon: PlayerPokemon & { species: PokemonSpecies }
): Promise<UseItemResult> {
  const healHp = readNumberData(entry.item.data, "healHp");
  if (!healHp || healHp <= 0) {
    return { ok: false, message: `${entry.item.name} ainda nao tem efeito de cura configurado.` };
  }

  if (pokemon.currentHp >= pokemon.maxHp) {
    return { ok: false, message: `${formatPokemonName(pokemon)} ja esta com HP cheio.` };
  }

  const nextHp = Math.min(pokemon.maxHp, pokemon.currentHp + healHp);
  await tx.playerPokemon.update({
    where: { id: pokemon.id },
    data: { currentHp: nextHp }
  });
  await consumeInventoryItem(tx, entry.id);

  return {
    ok: true,
    message: `${entry.item.name} usado em ${formatPokemonName(pokemon)}. HP: ${pokemon.currentHp}/${pokemon.maxHp} -> ${nextHp}/${pokemon.maxHp}.`
  };
}

async function useXpItem(
  tx: Prisma.TransactionClient,
  entry: InventoryEntry,
  pokemon: PlayerPokemon & { species: PokemonSpecies }
): Promise<UseItemResult> {
  const levelGain = Math.max(1, Math.floor(readNumberData(entry.item.data, "levelGain") ?? 1));
  const nextLevel = pokemon.level + levelGain;
  const nextMaxHp = calculateHp(readStatTable(pokemon.species.baseStats), readStatTable(pokemon.ivs), readStatTable(pokemon.evs), nextLevel);
  const hpGain = Math.max(0, nextMaxHp - pokemon.maxHp);

  await tx.playerPokemon.update({
    where: { id: pokemon.id },
    data: {
      level: nextLevel,
      maxHp: nextMaxHp,
      currentHp: Math.min(nextMaxHp, pokemon.currentHp + hpGain)
    }
  });
  await consumeInventoryItem(tx, entry.id);

  return {
    ok: true,
    message: `${entry.item.name} usado em ${formatPokemonName(pokemon)}. Nivel ${pokemon.level} -> ${nextLevel}.`
  };
}

async function useEvolutionItem(
  tx: Prisma.TransactionClient,
  entry: InventoryEntry,
  pokemon: PlayerPokemon & { species: PokemonSpecies }
): Promise<UseItemResult> {
  const evolution = readItemEvolutions(pokemon.species.evolutions).find(
    (candidate) => candidate.method === "item" && candidate.item === entry.item.slug
  );

  if (!evolution) {
    return { ok: false, message: `${formatPokemonName(pokemon)} nao evolui com ${entry.item.name}.` };
  }

  const nextSpecies = await tx.pokemonSpecies.findUnique({ where: { slug: evolution.to } });
  if (!nextSpecies) {
    return { ok: false, message: `A evolucao ${evolution.to} ainda nao esta cadastrada.` };
  }

  await tx.playerPokemon.update({
    where: { id: pokemon.id },
    data: { speciesId: nextSpecies.id }
  });
  await consumeInventoryItem(tx, entry.id);

  return {
    ok: true,
    message: `${formatPokemonName(pokemon)} evoluiu para ${nextSpecies.name}.`
  };
}

async function consumeInventoryItem(tx: Prisma.TransactionClient, inventoryId: string): Promise<void> {
  await tx.inventory.update({
    where: { id: inventoryId },
    data: { quantity: { decrement: 1 } }
  });
}

async function renderTrainerCardPng(input: {
  user: User;
  team: TeamPokemon[];
  capturedCount: number;
  profile: TrainerMenuProfile;
}): Promise<Buffer> {
  const avatarDataUri = await fetchImageDataUri(input.profile.avatarUrl);
  const teamImages = await Promise.all(
    input.team.map((pokemon) =>
      fetchImageDataUri(pokemon.shiny ? pokemon.species.shinySpriteUrl ?? pokemon.species.spriteUrl : pokemon.species.spriteUrl)
    )
  );

  const svg = buildTrainerCardSvg(input, avatarDataUri, teamImages);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function renderItemCardPng(entry: InventoryEntry): Promise<Buffer> {
  const spriteDataUri = await fetchImageDataUri(entry.item.spriteUrl);
  const svg = buildItemCardSvg(entry, spriteDataUri);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function buildTrainerCardSvg(
  input: {
    user: User;
    team: TeamPokemon[];
    capturedCount: number;
    profile: TrainerMenuProfile;
  },
  avatarDataUri: string | null,
  teamImages: Array<string | null>
): string {
  const badgeElements = buildBadgeElements(input.user.badges);
  const teamElements = buildTeamElements(input.team, teamImages);
  const trainerName = truncate(input.profile.displayName.toUpperCase(), 18);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <linearGradient id="card-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a63ba"/>
      <stop offset="0.42" stop-color="#2f84de"/>
      <stop offset="1" stop-color="#0e4a9a"/>
    </linearGradient>
    <linearGradient id="panel-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8cc8ff" stop-opacity="0.78"/>
      <stop offset="0.42" stop-color="#4b9aec" stop-opacity="0.70"/>
      <stop offset="1" stop-color="#236dc2" stop-opacity="0.82"/>
    </linearGradient>
    <linearGradient id="party-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a69c4"/>
      <stop offset="1" stop-color="#0f4c9a"/>
    </linearGradient>
    <linearGradient id="slot-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#62a9f4" stop-opacity="0.86"/>
      <stop offset="1" stop-color="#2d75cf" stop-opacity="0.76"/>
    </linearGradient>
    <pattern id="pixel-grid" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#ffffff" stroke-opacity="0.055" stroke-width="1"/>
    </pattern>
    <clipPath id="card-inner-clip">
      <rect x="24" y="24" width="1488" height="976" rx="18"/>
    </clipPath>
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#062b5f" flood-opacity="0.45"/>
    </filter>
    <filter id="blue-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="12" flood-color="#8cd4ff" flood-opacity="0.45"/>
    </filter>
    <filter id="pixel-soften">
      <feComponentTransfer>
        <feFuncR type="gamma" amplitude="1.05" exponent="0.98"/>
        <feFuncG type="gamma" amplitude="1.05" exponent="0.98"/>
        <feFuncB type="gamma" amplitude="1.08" exponent="0.98"/>
      </feComponentTransfer>
    </filter>
    <clipPath id="avatar-clip">
      <rect x="1050" y="162" width="410" height="410" rx="24"/>
    </clipPath>
  </defs>

  <rect x="7" y="7" width="1522" height="1010" rx="30" fill="#101624"/>
  <rect x="14" y="14" width="1508" height="996" rx="24" fill="url(#card-bg)" stroke="#f1fbff" stroke-width="5"/>
  <rect x="24" y="24" width="1488" height="976" rx="18" fill="url(#pixel-grid)" opacity="0.7"/>
  <rect x="24" y="24" width="1488" height="976" rx="18" fill="none" stroke="#56a6f5" stroke-width="3" stroke-opacity="0.75"/>

  <g opacity="0.13" clip-path="url(#card-inner-clip)">
    <circle cx="540" cy="294" r="306" fill="#f8fbff"/>
    <circle cx="540" cy="294" r="132" fill="#2b80da"/>
    <circle cx="540" cy="294" r="92" fill="#f8fbff"/>
    <rect x="245" y="266" width="232" height="56" rx="28" fill="#f8fbff"/>
    <rect x="623" y="266" width="232" height="56" rx="28" fill="#f8fbff"/>
    <path d="M240 294a300 300 0 0 1 600 0" fill="none" stroke="#f8fbff" stroke-width="50"/>
  </g>

  <g filter="url(#soft-shadow)">
    <text x="112" y="92" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="56" font-weight="800" fill="#f8fbff" stroke="#123d7a" stroke-width="3">CARTÃO DE TREINADOR</text>
    <circle cx="72" cy="70" r="27" fill="#f8fbff"/>
    <circle cx="72" cy="70" r="15" fill="none" stroke="#1764b9" stroke-width="7"/>
    <line x1="45" y1="70" x2="99" y2="70" stroke="#1764b9" stroke-width="8"/>
  </g>

  <rect x="38" y="132" width="920" height="104" rx="12" fill="url(#panel-bg)" stroke="#8fd0ff" stroke-opacity="0.45" stroke-width="2" filter="url(#soft-shadow)"/>
  <rect x="44" y="138" width="908" height="28" rx="10" fill="#ffffff" opacity="0.13"/>
  <rect x="38" y="252" width="920" height="104" rx="12" fill="url(#panel-bg)" stroke="#8fd0ff" stroke-opacity="0.45" stroke-width="2" filter="url(#soft-shadow)"/>
  <rect x="44" y="258" width="908" height="28" rx="10" fill="#ffffff" opacity="0.13"/>
  <rect x="38" y="372" width="920" height="104" rx="12" fill="url(#panel-bg)" stroke="#8fd0ff" stroke-opacity="0.45" stroke-width="2" filter="url(#soft-shadow)"/>
  <rect x="44" y="378" width="908" height="28" rx="10" fill="#ffffff" opacity="0.13"/>

  ${buildInfoIcon("trainer", 95, 185)}
  ${buildInfoIcon("coin", 95, 305)}
  ${buildInfoIcon("ball", 95, 425)}

  <text x="174" y="207" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="42" font-weight="800" fill="#f8fbff" stroke="#15396e" stroke-width="1.5">NOME DO TREINADOR</text>
  <text x="930" y="207" text-anchor="end" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="40" font-weight="800" fill="#101827">${escapeXml(trainerName)}</text>
  <text x="174" y="327" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="42" font-weight="800" fill="#f8fbff" stroke="#15396e" stroke-width="1.5">DINHEIRO TOTAL</text>
  <text x="930" y="327" text-anchor="end" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="40" font-weight="800" fill="#ffe75c" stroke="#5d4207" stroke-width="1">₽ ${escapeXml(formatNumber(input.user.coins))}</text>
  <text x="174" y="447" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="42" font-weight="800" fill="#f8fbff" stroke="#15396e" stroke-width="1.5">POKÉDEX</text>
  <text x="930" y="447" text-anchor="end" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="40" font-weight="800" fill="#101827">${input.capturedCount}</text>

  <rect x="1016" y="122" width="490" height="498" rx="30" fill="#2b6fc2" stroke="#15519e" stroke-width="5" filter="url(#blue-glow)"/>
  <rect x="1031" y="137" width="460" height="468" rx="28" fill="#1c5fab" stroke="#9ad5ff" stroke-width="3" opacity="0.82"/>
  <rect x="1050" y="162" width="410" height="410" rx="24" fill="#65aff5" stroke="#0f4c9a" stroke-width="4"/>
  ${avatarDataUri ? `<image href="${avatarDataUri}" x="1050" y="162" width="410" height="410" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar-clip)" filter="url(#pixel-soften)" style="image-rendering: pixelated;"/>` : buildAvatarFallback(input.profile.displayName)}
  <rect x="1050" y="162" width="410" height="410" rx="24" fill="url(#pixel-grid)" opacity="0.22"/>
  <rect x="1058" y="170" width="394" height="72" rx="18" fill="#ffffff" opacity="0.10"/>
  <polygon points="1464,40 1478,73 1513,76 1486,99 1494,133 1464,115 1434,133 1442,99 1415,76 1450,73" fill="#ffe75c" stroke="#c78b10" stroke-width="3" filter="url(#soft-shadow)"/>

  <rect x="38" y="508" width="940" height="190" rx="14" fill="#1459ab" stroke="#0d4690" stroke-width="4" filter="url(#soft-shadow)"/>
  <text x="64" y="553" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="36" font-weight="800" fill="#f8fbff" stroke="#123d7a" stroke-width="2">INSÍGNIAS</text>
  <rect x="58" y="566" width="902" height="110" rx="10" fill="#3f8cdd" opacity="0.62" stroke="#8fd0ff" stroke-opacity="0.42" stroke-width="3"/>
  ${badgeElements}

  <rect x="38" y="720" width="1460" height="245" rx="14" fill="url(#party-bg)" stroke="#0d4690" stroke-width="4" filter="url(#soft-shadow)"/>
  <text x="64" y="760" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="36" font-weight="800" fill="#f8fbff" stroke="#123d7a" stroke-width="2">EQUIPE</text>
  ${teamElements}
</svg>`;
}

function buildItemCardSvg(entry: InventoryEntry, spriteDataUri: string | null): string {
  const description = wrapText(describeItem(entry.item), 46, 5);
  const descriptionSvg = description
    .map(
      (line, index) =>
        `<text x="330" y="${178 + index * 32}" font-family="Consolas, monospace" font-size="24" fill="#f8fbff">${escapeXml(line)}</text>`
    )
    .join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${ITEM_CARD_WIDTH}" height="${ITEM_CARD_HEIGHT}" viewBox="0 0 ${ITEM_CARD_WIDTH} ${ITEM_CARD_HEIGHT}">
  <defs>
    <linearGradient id="item-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1d67bd"/>
      <stop offset="1" stop-color="#0f4fa5"/>
    </linearGradient>
  </defs>
  <rect x="6" y="6" width="908" height="448" rx="24" fill="#111827"/>
  <rect x="14" y="14" width="892" height="432" rx="18" fill="url(#item-bg)" stroke="#e7f2ff" stroke-width="4"/>
  <rect x="48" y="84" width="240" height="240" rx="18" fill="#6ab4ff" opacity="0.72" stroke="#0d4690" stroke-width="4"/>
  ${spriteDataUri ? `<image href="${spriteDataUri}" x="82" y="118" width="172" height="172" preserveAspectRatio="xMidYMid meet"/>` : `<text x="168" y="210" text-anchor="middle" font-family="Consolas, monospace" font-size="32" font-weight="800" fill="#f8fbff">ITEM</text>`}
  <text x="330" y="102" font-family="Consolas, monospace" font-size="42" font-weight="800" fill="#f8fbff" stroke="#15396e" stroke-width="1.5">${escapeXml(truncate(entry.item.name, 24))}</text>
  <text x="330" y="140" font-family="Consolas, monospace" font-size="24" fill="#dcecff">Qtd: ${entry.quantity} | ${escapeXml(formatItemCategory(entry.item.category))}</text>
  ${descriptionSvg}
  <rect x="48" y="346" width="820" height="62" rx="12" fill="#2c75cc" opacity="0.8"/>
  <text x="70" y="386" font-family="Consolas, monospace" font-size="24" fill="#f8fbff">Escolha Usar para selecionar um Pokemon da equipe.</text>
</svg>`;
}

function buildInfoIcon(kind: "trainer" | "coin" | "ball", cx: number, cy: number): string {
  if (kind === "coin") {
    return `
      <circle cx="${cx}" cy="${cy}" r="35" fill="#f9d34f" stroke="#b77a16" stroke-width="6"/>
      <circle cx="${cx}" cy="${cy}" r="22" fill="none" stroke="#e6a624" stroke-width="5"/>
      <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-family="Consolas, monospace" font-size="28" font-weight="800" fill="#a46910">P</text>`;
  }

  if (kind === "ball") {
    return `
      <circle cx="${cx}" cy="${cy}" r="35" fill="#f8fbff" stroke="#111827" stroke-width="5"/>
      <path d="M ${cx - 33} ${cy} A 33 33 0 0 1 ${cx + 33} ${cy}" fill="#e53b3b" stroke="#111827" stroke-width="5"/>
      <line x1="${cx - 34}" y1="${cy}" x2="${cx + 34}" y2="${cy}" stroke="#111827" stroke-width="6"/>
      <circle cx="${cx}" cy="${cy}" r="12" fill="#f8fbff" stroke="#111827" stroke-width="5"/>`;
  }

  return `
    <rect x="${cx - 28}" y="${cy - 32}" width="56" height="64" rx="14" fill="#f8fbff" stroke="#15396e" stroke-width="4"/>
    <circle cx="${cx}" cy="${cy - 10}" r="12" fill="#1f2937"/>
    <rect x="${cx - 16}" y="${cy + 3}" width="32" height="22" rx="8" fill="#1f2937"/>
    <rect x="${cx - 24}" y="${cy - 34}" width="48" height="18" rx="6" fill="#e53b3b" stroke="#111827" stroke-width="3"/>`;
}

function buildBadgeElements(badges: string[]): string {
  const colors = ["#b9c0c9", "#58c7ff", "#f7c948", "#ff8bd2", "#f6657c", "#cfd4df", "#70d178", "#9b7cff"];
  const slots = Array.from({ length: 8 }, (_, index) => {
    const badge = badges[index];
    const x = 108 + index * 108;
    const color = colors[index] ?? "#b8bec7";
    const points = `${x},584 ${x + 34},603 ${x + 34},641 ${x},662 ${x - 34},641 ${x - 34},603`;

    if (!badge) {
      return `
        <polygon points="${points}" fill="#164b91" opacity="0.62"/>
        <polygon points="${points}" fill="none" stroke="#0d3e7c" stroke-width="4" opacity="0.85"/>
        <circle cx="${x}" cy="622" r="18" fill="#0f4387" opacity="0.55"/>`;
    }

    return `
      <polygon points="${points}" fill="${color}" stroke="#102f5f" stroke-width="4" filter="url(#blue-glow)"/>
      <polygon points="${x},592 ${x + 13},612 ${x + 28},616 ${x + 11},629 ${x + 16},652 ${x},640 ${x - 16},652 ${x - 11},629 ${x - 28},616 ${x - 13},612" fill="#ffffff" opacity="0.36"/>
      <circle cx="${x}" cy="622" r="16" fill="#ffffff" opacity="0.25"/>
      <text x="${x}" y="632" text-anchor="middle" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="25" font-weight="800" fill="#101827">${escapeXml(badge[0]?.toUpperCase() ?? "")}</text>`;
  });

  return slots.join("");
}

function buildTeamElements(team: TeamPokemon[], teamImages: Array<string | null>): string {
  const slotWidth = 208;
  const gap = 28;
  const startX = 84;

  return Array.from({ length: 6 }, (_, index) => {
    const x = startX + index * (slotWidth + gap);
    const pokemon = team[index];
    const image = teamImages[index];
    const name = pokemon ? truncate(formatPokemonName(pokemon), 14) : "VAZIO";
    const imageSvg = image
      ? `<image href="${image}" x="${x + 20}" y="778" width="168" height="136" preserveAspectRatio="xMidYMid meet" style="image-rendering: pixelated;"/>`
      : `<g opacity="0.82"><circle cx="${x + slotWidth / 2}" cy="848" r="43" fill="#174f95"/><circle cx="${x + slotWidth / 2}" cy="848" r="22" fill="#0f4387"/></g>`;

    return `
      <rect x="${x}" y="770" width="${slotWidth}" height="172" rx="12" fill="url(#slot-bg)" stroke="#0d4690" stroke-width="4"/>
      <rect x="${x + 8}" y="778" width="${slotWidth - 16}" height="36" rx="9" fill="#ffffff" opacity="0.12"/>
      <ellipse cx="${x + slotWidth / 2}" cy="888" rx="70" ry="18" fill="#0e4386" opacity="0.36"/>
      ${imageSvg}
      <text x="${x + slotWidth / 2}" y="928" text-anchor="middle" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="20" font-weight="800" fill="#f8fbff" stroke="#0d3e7c" stroke-width="1">${escapeXml(name.toUpperCase())}</text>`;
  }).join("");
}

function buildAvatarFallback(displayName: string): string {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return `
    <circle cx="1255" cy="365" r="136" fill="#2d75cf" stroke="#e7f2ff" stroke-width="5"/>
    <text x="1255" y="390" text-anchor="middle" font-family="Consolas, monospace" font-size="76" font-weight="800" fill="#f8fbff">${escapeXml(initials || "T")}</text>`;
}

function buildPokemonCollectionEmbed(
  mode: "pokemon" | "box",
  pokemon: CollectionPokemon[],
  currentPage: number,
  totalPages: number,
  total: number
): EmbedBuilder {
  const isBox = mode === "box";
  const embed = new EmbedBuilder()
    .setColor(isBox ? 0x5865f2 : 0xf05f57)
    .setTitle(isBox ? "Box Pokemon" : "Colecao Pokemon");

  if (pokemon.length === 0) {
    embed.setDescription(isBox ? "Sua box esta vazia." : "Voce ainda nao capturou nenhum Pokemon.");
    return embed;
  }

  const start = (currentPage - 1) * POKEMON_LIST_PAGE_SIZE + 1;
  const end = start + pokemon.length - 1;
  embed
    .setDescription(isBox ? buildBoxTable(pokemon) : buildPokemonTable(pokemon))
    .setFooter({ text: `Mostrando ${start}-${end} de ${total}. Pagina ${currentPage}/${totalPages}.` });

  const thumbnail = pokemon
    .map((entry) => entry.shiny ? entry.species.shinySpriteUrl ?? entry.species.spriteUrl : entry.species.spriteUrl)
    .find((url): url is string => Boolean(url));
  if (thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  return embed;
}

function buildPokemonTeamEmbed(pokemon: CollectionPokemon[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x6b7280)
    .setTitle("Equipe Pokemon");

  if (pokemon.length === 0) {
    embed.setDescription("Sua equipe esta vazia.");
    return embed;
  }

  embed
    .setDescription(buildTeamTable(pokemon))
    .setFooter({ text: `Equipe atual: ${pokemon.length}/6.` });

  const thumbnail = pokemon
    .map((entry) => entry.shiny ? entry.species.shinySpriteUrl ?? entry.species.spriteUrl : entry.species.spriteUrl)
    .find((url): url is string => Boolean(url));
  if (thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  return embed;
}

function buildPokemonTable(pokemon: CollectionPokemon[]): string {
  const header = [
    tableCell("Ref", 8),
    tableCell("Pokemon", 20),
    tableCell("Lv", 4, "right"),
    tableCell("IV%", 7, "right"),
    tableCell("HP", 9, "right"),
    tableCell("Local", 8),
    tableCell("Tags", 7)
  ].join(" ");
  const rows = pokemon.map((entry) =>
    [
      tableCell(shortPokemonRef(entry.id), 8),
      tableCell(formatListPokemonName(entry), 20),
      tableCell(String(entry.level), 4, "right"),
      tableCell(formatIvPercent(entry.ivs), 7, "right"),
      tableCell(`${entry.currentHp}/${entry.maxHp}`, 9, "right"),
      tableCell(formatPokemonLocation(entry), 8),
      tableCell(formatPokemonTags(entry), 7)
    ].join(" ")
  );

  return codeBlock([header, ...rows]);
}

function buildTeamTable(pokemon: CollectionPokemon[]): string {
  const header = [
    tableCell("Slot", 5),
    tableCell("Ref", 8),
    tableCell("Pokemon", 20),
    tableCell("Lv", 4, "right"),
    tableCell("IV%", 7, "right"),
    tableCell("HP", 9, "right"),
    tableCell("Tags", 7)
  ].join(" ");
  const rows = pokemon.map((entry) =>
    [
      tableCell(formatTeamSlot(entry), 5),
      tableCell(shortPokemonRef(entry.id), 8),
      tableCell(formatListPokemonName(entry), 20),
      tableCell(String(entry.level), 4, "right"),
      tableCell(formatIvPercent(entry.ivs), 7, "right"),
      tableCell(`${entry.currentHp}/${entry.maxHp}`, 9, "right"),
      tableCell(formatPokemonTags(entry), 7)
    ].join(" ")
  );

  return codeBlock([header, ...rows]);
}

function buildBoxTable(pokemon: CollectionPokemon[]): string {
  const header = [
    tableCell("Slot", 7),
    tableCell("Ref", 8),
    tableCell("Pokemon", 20),
    tableCell("Lv", 4, "right"),
    tableCell("IV%", 7, "right"),
    tableCell("HP", 9, "right"),
    tableCell("Tags", 7)
  ].join(" ");
  const rows = pokemon.map((entry) =>
    [
      tableCell(formatBoxSlot(entry), 7),
      tableCell(shortPokemonRef(entry.id), 8),
      tableCell(formatListPokemonName(entry), 20),
      tableCell(String(entry.level), 4, "right"),
      tableCell(formatIvPercent(entry.ivs), 7, "right"),
      tableCell(`${entry.currentHp}/${entry.maxHp}`, 9, "right"),
      tableCell(formatPokemonTags(entry), 7)
    ].join(" ")
  );

  return codeBlock([header, ...rows]);
}

function buildNavRow(ownerDiscordId: string, active: MenuTab): MenuComponentRow {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId(ownerDiscordId, "card"))
      .setEmoji({ id: "1507588890163417108", name: "Trainer" })
      .setLabel("𝗧𝗿𝗲𝗶𝗻𝗮𝗱𝗼𝗿")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(active === "card"),
    new ButtonBuilder()
      .setCustomId(customId(ownerDiscordId, "bag"))
      .setEmoji({ id: "1507588809045315635", name: "Bag" })
      .setLabel("𝗠𝗼𝗰𝗵𝗶𝗹𝗮")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(active === "bag"),
    new ButtonBuilder()
      .setCustomId(customId(ownerDiscordId, "team"))
      .setEmoji({ id: "1507588822639186011", name: "Team" })
      .setLabel("𝗘𝗾𝘂𝗶𝗽𝗲")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(active === "team"),
    new ButtonBuilder()
      .setCustomId(customId(ownerDiscordId, "box", "1"))
      .setEmoji({ id: "1507588834366460044", name: "Box" })
      .setLabel("𝗖𝗮𝗶𝘅𝗮")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(active === "box"),
    new ButtonBuilder()
      .setCustomId(customId(ownerDiscordId, "map"))
      .setEmoji({ id: "1507588846152323232", name: "Map" })
      .setLabel("𝗠𝗮𝗽𝗮")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(active === "map")
  );
}

function buildPokemonPaginationRow(ownerDiscordId: string, action: "pokemon" | "box", currentPage: number, totalPages: number): MenuComponentRow {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId(ownerDiscordId, action, String(Math.max(1, currentPage - 1))))
      .setLabel("Anterior")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 1),
    new ButtonBuilder()
      .setCustomId(customId(ownerDiscordId, action, String(currentPage)))
      .setLabel(`${currentPage}/${totalPages}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(customId(ownerDiscordId, action, String(Math.min(totalPages, currentPage + 1))))
      .setLabel("Proxima")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages)
  );
}

function buildInventoryItemRows(ownerDiscordId: string, inventory: InventoryEntry[]): MenuComponentRow[] {
  return chunk(inventory, 5).map((entries, rowIndex) => {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    row.addComponents(
      entries.map((entry, entryIndex) => {
        const displayIndex = rowIndex * 5 + entryIndex + 1;
        return new ButtonBuilder()
          .setCustomId(customId(ownerDiscordId, "view", entry.item.id))
          .setLabel(`Ver ${displayIndex}`)
          .setStyle(ButtonStyle.Secondary);
      })
    );
    return row;
  });
}

function buildItemActionRow(ownerDiscordId: string, item: Pick<Item, "id" | "category">): MenuComponentRow {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId(ownerDiscordId, "use", item.id))
      .setLabel("Usar")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!isPokemonTargetItem(item.category)),
    new ButtonBuilder()
      .setCustomId(customId(ownerDiscordId, "bag"))
      .setLabel("Fechar")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildBackToBagRow(ownerDiscordId: string): MenuComponentRow {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId(ownerDiscordId, "bag"))
      .setLabel("Fechar")
      .setStyle(ButtonStyle.Secondary)
  );
}

function customId(ownerDiscordId: string, action: MenuAction, subject?: string): string {
  return [MENU_SCOPE, ownerDiscordId, action, subject].filter(Boolean).join(":");
}

function parsePage(raw: string | undefined): number {
  const page = Number(raw);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function clampPage(page: number, totalPages: number): number {
  const normalized = Number.isFinite(page) ? Math.floor(page) : 1;
  return Math.min(totalPages, Math.max(1, normalized));
}

function parseCustomId(id: string): ParsedCustomId | null {
  const [scope, ownerDiscordId, rawAction, subject] = id.split(":");
  if (scope !== MENU_SCOPE || !ownerDiscordId || !isMenuAction(rawAction)) {
    return null;
  }

  return { ownerDiscordId, action: rawAction, subject };
}

function isMenuAction(action: string | undefined): action is MenuAction {
  return (
    action === "card" ||
    action === "bag" ||
    action === "team" ||
    action === "pokemon" ||
    action === "box" ||
    action === "map" ||
    action === "view" ||
    action === "use" ||
    action === "target" ||
    action === "close"
  );
}

function isPokemonTargetItem(category: ItemCategory): boolean {
  return category === ItemCategory.HEALING || category === ItemCategory.XP || category === ItemCategory.EVOLUTION;
}

function formatPokemonName(pokemon: Pick<PlayerPokemon, "nickname"> & { species: Pick<PokemonSpecies, "name"> }): string {
  return pokemon.nickname ? `${pokemon.nickname} (${pokemon.species.name})` : pokemon.species.name;
}

function formatListPokemonName(pokemon: CollectionPokemon): string {
  const name = cleanTableText(formatPokemonName(pokemon));
  return pokemon.shiny ? `*${name}` : name;
}

function formatPokemonLocation(pokemon: CollectionPokemon): string {
  if (pokemon.isInTeam) {
    return `Eq ${pokemon.teamSlot ?? "?"}`;
  }

  return `B${String(pokemon.boxNumber).padStart(2, "0")}/${pokemon.boxSlot ? String(pokemon.boxSlot).padStart(2, "0") : "--"}`;
}

function formatBoxSlot(pokemon: Pick<PlayerPokemon, "boxNumber" | "boxSlot">): string {
  const box = String(pokemon.boxNumber).padStart(2, "0");
  const slot = pokemon.boxSlot ? String(pokemon.boxSlot).padStart(2, "0") : "--";
  return `${box}/${slot}`;
}

function formatTeamSlot(pokemon: Pick<PlayerPokemon, "teamSlot">): string {
  return `#${pokemon.teamSlot ?? "?"}`;
}

function formatPokemonTags(pokemon: Pick<PlayerPokemon, "shiny" | "isFavorite">): string {
  const tags = [];
  if (pokemon.shiny) {
    tags.push("Sh");
  }
  if (pokemon.isFavorite) {
    tags.push("Fav");
  }

  return tags.join(",") || "-";
}

function formatIvPercent(raw: unknown): string {
  const ivs = readStatTable(raw);
  const total = ivs.hp + ivs.attack + ivs.defense + ivs.specialAttack + ivs.specialDefense + ivs.speed;
  return ((total / 186) * 100).toFixed(2);
}

function shortPokemonRef(id: string): string {
  return id.slice(0, 8);
}

function tableCell(value: string, width: number, align: "left" | "right" = "left"): string {
  const cleanValue = truncate(cleanTableText(value), width);
  return align === "right" ? cleanValue.padStart(width) : cleanValue.padEnd(width);
}

function cleanTableText(value: string): string {
  return value.replace(/`/g, "'").replace(/\s+/g, " ").trim();
}

function codeBlock(lines: string[]): string {
  return ["```txt", ...lines, "```"].join("\n");
}

function formatItemCategory(category: ItemCategory): string {
  switch (category) {
    case ItemCategory.POKE_BALL:
      return "Poke Ball";
    case ItemCategory.HEALING:
      return "Cura";
    case ItemCategory.EVOLUTION:
      return "Evolucao";
    case ItemCategory.XP:
      return "XP";
    case ItemCategory.KEY:
      return "Chave";
    default:
      return "Outro";
  }
}

function describeItem(item: Pick<Item, "category" | "data"> & { name: string }): string {
  const healHp = readNumberData(item.data, "healHp");
  const levelGain = readNumberData(item.data, "levelGain");
  const captureBonus = readNumberData(item.data, "captureBonus");

  if (item.category === ItemCategory.HEALING && healHp) {
    return `Recupera ate ${healHp} HP de um Pokemon da equipe.`;
  }

  if (item.category === ItemCategory.XP && levelGain) {
    return `Aumenta o nivel de um Pokemon em ${levelGain}.`;
  }

  if (item.category === ItemCategory.POKE_BALL && captureBonus) {
    return `Usada em encontros selvagens. Bonus de captura x${captureBonus}.`;
  }

  if (item.category === ItemCategory.EVOLUTION) {
    return "Item especial usado para evoluir Pokemon compativeis.";
  }

  return `${item.name} ainda nao possui uma descricao especial.`;
}

function readNumberData(raw: unknown, key: string): number | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readItemEvolutions(raw: unknown): ItemEvolution[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const source = entry as Record<string, unknown>;
    const to = source.to;
    const method = source.method;
    const item = source.item;

    if (typeof to !== "string" || typeof method !== "string") {
      return [];
    }

    return [{ to, method, item: typeof item === "string" ? item : undefined }];
  });
}

function readStatTable(raw: unknown): StatTable {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

  return {
    hp: readStatValue(source.hp),
    attack: readStatValue(source.attack),
    defense: readStatValue(source.defense),
    specialAttack: readStatValue(source.specialAttack),
    specialDefense: readStatValue(source.specialDefense),
    speed: readStatValue(source.speed)
  };
}

function readStatValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function calculateHp(baseStats: StatTable, ivs: StatTable, evs: StatTable, level: number): number {
  return Math.floor(((2 * baseStats.hp + ivs.hp + Math.floor(evs.hp / 4)) * level) / 100) + level + 10;
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }

    if (lines.length === maxLines) {
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  return lines;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}.` : value;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function escapeXml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
