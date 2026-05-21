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
import type { AppServices } from "../../services/createServices.js";
import { renderItemCardWithPillow, renderTrainerCardWithPillow } from "./pillowRenderer.js";

const MENU_SCOPE = "trainer-menu";
const CARD_FILE_NAME = "trainer-card.png";
const ITEM_FILE_NAME = "item-card.png";
const CARD_WIDTH = 1536;
const CARD_HEIGHT = 1024;
const ITEM_CARD_WIDTH = 920;
const ITEM_CARD_HEIGHT = 460;
const MAX_INVENTORY_BUTTONS = 20;

type MenuAction = "card" | "bag" | "view" | "use" | "target" | "close";
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
  return renderTrainerCardWithPillow({
    trainer: {
      name: input.profile.displayName,
      money: input.user.coins,
      pokedex: input.capturedCount,
      avatarUrl: input.profile.avatarUrl
    },
    badges: input.user.badges,
    team: input.team.map((pokemon) => ({
      name: formatPokemonName(pokemon),
      spriteUrl: pokemon.shiny ? pokemon.species.shinySpriteUrl ?? pokemon.species.spriteUrl : pokemon.species.spriteUrl
    }))
  });
}

async function renderItemCardPng(entry: InventoryEntry): Promise<Buffer> {
  return renderItemCardWithPillow({
    item: {
      name: entry.item.name,
      quantity: entry.quantity,
      category: entry.item.category,
      categoryLabel: formatItemCategory(entry.item.category),
      spriteUrl: entry.item.spriteUrl,
      description: describeItem(entry.item)
    }
  });
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
  const trainerName = truncate(input.profile.displayName.toUpperCase(), 20);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <linearGradient id="card-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1d67bd"/>
      <stop offset="0.48" stop-color="#2f84e4"/>
      <stop offset="1" stop-color="#0f4fa5"/>
    </linearGradient>
    <linearGradient id="panel-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#76b9ff" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#2d75cf" stop-opacity="0.72"/>
    </linearGradient>
    <clipPath id="avatar-clip">
      <rect x="1040" y="150" width="430" height="430" rx="28"/>
    </clipPath>
  </defs>
  <rect x="7" y="7" width="1522" height="1010" rx="30" fill="#111827"/>
  <rect x="14" y="14" width="1508" height="996" rx="24" fill="url(#card-bg)" stroke="#e7f2ff" stroke-width="5"/>
  <circle cx="535" cy="238" r="285" fill="#ffffff" opacity="0.11"/>
  <circle cx="535" cy="238" r="150" fill="url(#card-bg)" opacity="0.35"/>
  <rect x="38" y="132" width="920" height="104" rx="10" fill="url(#panel-bg)"/>
  <rect x="38" y="252" width="920" height="104" rx="10" fill="url(#panel-bg)"/>
  <rect x="38" y="372" width="920" height="104" rx="10" fill="url(#panel-bg)"/>
  <text x="112" y="92" font-family="Consolas, monospace" font-size="56" font-weight="800" fill="#f8fbff" stroke="#15396e" stroke-width="2">CARTAO DE TREINADOR</text>
  <circle cx="72" cy="70" r="27" fill="#f8fbff"/>
  <circle cx="72" cy="70" r="15" fill="none" stroke="#1764b9" stroke-width="7"/>
  <line x1="45" y1="70" x2="99" y2="70" stroke="#1764b9" stroke-width="8"/>
  <polygon points="1464,40 1478,73 1513,76 1486,99 1494,133 1464,115 1434,133 1442,99 1415,76 1450,73" fill="#ffe75c"/>
  ${buildInfoIcon("trainer", 95, 185)}
  ${buildInfoIcon("coin", 95, 305)}
  ${buildInfoIcon("ball", 95, 425)}
  <text x="174" y="207" font-family="Consolas, monospace" font-size="42" font-weight="800" fill="#f8fbff" stroke="#15396e" stroke-width="1.5">NOME DO TREINADOR</text>
  <text x="930" y="207" text-anchor="end" font-family="Consolas, monospace" font-size="38" font-weight="800" fill="#111827">${escapeXml(trainerName)}</text>
  <text x="174" y="327" font-family="Consolas, monospace" font-size="42" font-weight="800" fill="#f8fbff" stroke="#15396e" stroke-width="1.5">DINHEIRO TOTAL</text>
  <text x="930" y="327" text-anchor="end" font-family="Consolas, monospace" font-size="38" font-weight="800" fill="#111827">P$ ${escapeXml(formatNumber(input.user.coins))}</text>
  <text x="174" y="447" font-family="Consolas, monospace" font-size="42" font-weight="800" fill="#f8fbff" stroke="#15396e" stroke-width="1.5">POKEMON CAPTURADOS</text>
  <text x="930" y="447" text-anchor="end" font-family="Consolas, monospace" font-size="38" font-weight="800" fill="#111827">${input.capturedCount}</text>
  <rect x="1016" y="122" width="490" height="498" rx="30" fill="#2b6fc2" stroke="#15519e" stroke-width="5"/>
  <rect x="1040" y="150" width="430" height="430" rx="28" fill="#62a9f0" stroke="#84c7ff" stroke-width="3"/>
  ${avatarDataUri ? `<image href="${avatarDataUri}" x="1040" y="150" width="430" height="430" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar-clip)"/>` : buildAvatarFallback(input.profile.displayName)}
  <rect x="38" y="508" width="940" height="190" rx="14" fill="#1559ab" stroke="#0d4690" stroke-width="4"/>
  <text x="64" y="553" font-family="Consolas, monospace" font-size="36" font-weight="800" fill="#f8fbff">INSIGNIAS</text>
  <rect x="58" y="566" width="902" height="110" rx="10" fill="#3f8cdd" opacity="0.62" stroke="#0d4690" stroke-width="3"/>
  ${badgeElements}
  <rect x="38" y="720" width="1460" height="245" rx="14" fill="#1559ab" stroke="#0d4690" stroke-width="4"/>
  <text x="64" y="760" font-family="Consolas, monospace" font-size="36" font-weight="800" fill="#f8fbff">EQUIPE</text>
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
  const colors = ["#b8bec7", "#58c7ff", "#f7c948", "#ff89ca", "#f6657c", "#c0c7d5", "#70d178", "#9b7cff"];
  const slots = Array.from({ length: 8 }, (_, index) => {
    const badge = badges[index];
    const x = 108 + index * 108;
    const color = colors[index] ?? "#b8bec7";

    if (!badge) {
      return `<circle cx="${x}" cy="622" r="34" fill="#174f95" opacity="0.65"/>`;
    }

    return `
      <circle cx="${x}" cy="622" r="34" fill="${color}" stroke="#102f5f" stroke-width="4"/>
      <polygon points="${x},584 ${x + 12},610 ${x + 40},612 ${x + 18},630 ${x + 25},658 ${x},644 ${x - 25},658 ${x - 18},630 ${x - 40},612 ${x - 12},610" fill="#ffffff" opacity="0.35"/>
      <text x="${x}" y="631" text-anchor="middle" font-family="Consolas, monospace" font-size="26" font-weight="800" fill="#111827">${escapeXml(badge[0]?.toUpperCase() ?? "")}</text>`;
  });

  return slots.join("");
}

function buildTeamElements(team: TeamPokemon[], teamImages: Array<string | null>): string {
  const slotWidth = 218;
  const gap = 26;
  const startX = 84;

  return Array.from({ length: 6 }, (_, index) => {
    const x = startX + index * (slotWidth + gap);
    const pokemon = team[index];
    const image = teamImages[index];
    const name = pokemon ? truncate(formatPokemonName(pokemon), 14) : "VAZIO";
    const imageSvg = image
      ? `<image href="${image}" x="${x + 38}" y="780" width="142" height="142" preserveAspectRatio="xMidYMid meet"/>`
      : `<circle cx="${x + 109}" cy="852" r="42" fill="#174f95" opacity="0.7"/>`;

    return `
      <rect x="${x}" y="770" width="${slotWidth}" height="172" rx="12" fill="#4a93df" opacity="0.72" stroke="#0d4690" stroke-width="4"/>
      ${imageSvg}
      <text x="${x + slotWidth / 2}" y="928" text-anchor="middle" font-family="Consolas, monospace" font-size="20" font-weight="800" fill="#f8fbff">${escapeXml(name)}</text>`;
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

function buildNavRow(ownerDiscordId: string, active: "card" | "bag"): MenuComponentRow {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId(ownerDiscordId, "card"))
      .setLabel("Cartao")
      .setStyle(active === "card" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(active === "card"),
    new ButtonBuilder()
      .setCustomId(customId(ownerDiscordId, "bag"))
      .setLabel("Mochila")
      .setStyle(active === "bag" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(active === "bag")
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

function parseCustomId(id: string): ParsedCustomId | null {
  const [scope, ownerDiscordId, rawAction, subject] = id.split(":");
  if (scope !== MENU_SCOPE || !ownerDiscordId || !isMenuAction(rawAction)) {
    return null;
  }

  return { ownerDiscordId, action: rawAction, subject };
}

function isMenuAction(action: string | undefined): action is MenuAction {
  return action === "card" || action === "bag" || action === "view" || action === "use" || action === "target" || action === "close";
}

function isPokemonTargetItem(category: ItemCategory): boolean {
  return category === ItemCategory.HEALING || category === ItemCategory.XP || category === ItemCategory.EVOLUTION;
}

function formatPokemonName(pokemon: Pick<PlayerPokemon, "nickname"> & { species: Pick<PokemonSpecies, "name"> }): string {
  return pokemon.nickname ? `${pokemon.nickname} (${pokemon.species.name})` : pokemon.species.name;
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

async function fetchImageDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? inferImageMime(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function inferImageMime(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerUrl.endsWith(".webp")) {
    return "image/webp";
  }
  if (lowerUrl.endsWith(".gif")) {
    return "image/gif";
  }
  return "image/png";
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
