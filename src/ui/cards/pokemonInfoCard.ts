import { PokemonGender, PokemonStatus, type PlayerPokemon, type PokemonSpecies, type User } from "@prisma/client";
import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import sharp from "sharp";
import { STAT_KEYS, type StatKey, type StatTable } from "../../domain/pokemon/types.js";
import type { AppServices } from "../../services/createServices.js";
import { fetchImageDataUri } from "../assets/imageCache.js";

const INFO_CARD_WIDTH = 1536;
const INFO_CARD_HEIGHT = 1024;
const INFO_CARD_FILE_NAME = "pokemon-info.png";
const MIN_REF_LENGTH = 4;

type PokemonInfoProfile = {
  discordId: string;
  username: string;
  displayName: string;
};

type PokemonInfoPayload = {
  content?: string;
  embeds?: EmbedBuilder[];
  files?: AttachmentBuilder[];
};

type PokemonInfoRecord = PlayerPokemon & {
  species: PokemonSpecies;
};

type EvolutionDisplay = Pick<PokemonSpecies, "name" | "spriteUrl" | "shinySpriteUrl" | "artworkUrl"> & {
  rule: EvolutionRule;
};

type EvolutionRule = {
  to: string;
  method: string;
  level?: number;
  item?: string;
  condition?: string;
};

type TypeTheme = {
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
};

export async function buildPokemonInfoPayload(
  services: AppServices,
  profile: PokemonInfoProfile,
  ref: string
): Promise<PokemonInfoPayload> {
  const normalizedRef = ref.trim().toLowerCase();
  if (normalizedRef.length < MIN_REF_LENGTH) {
    return { content: `Use uma ref com pelo menos ${MIN_REF_LENGTH} caracteres. Pegue a ref em .box ou .menu.` };
  }

  const user = await services.user.ensureUser({
    discordId: profile.discordId,
    username: profile.username
  });

  const matches = await services.prisma.playerPokemon.findMany({
    where: {
      userId: user.id,
      isReleased: false,
      id: { startsWith: normalizedRef }
    },
    include: { species: true },
    orderBy: { createdAt: "asc" },
    take: 3
  });

  if (matches.length === 0) {
    return { content: "Nao encontrei nenhum Pokemon seu com essa ref." };
  }

  if (matches.length > 1) {
    return { content: "Essa ref encontrou mais de um Pokemon. Use mais caracteres do ID exibido em .box ou .menu." };
  }

  const pokemon = matches[0];
  if (!pokemon) {
    return { content: "Nao encontrei nenhum Pokemon seu com essa ref." };
  }

  const [originalTrainer, evolutions] = await Promise.all([
    services.prisma.user.findUnique({
      where: { id: pokemon.originalTrainerId },
      select: { username: true }
    }),
    loadNextEvolutions(services, pokemon.species.evolutions)
  ]);
  const image = await renderPokemonInfoCard({
    pokemon,
    owner: user,
    profile,
    originalTrainerName: originalTrainer?.username ?? user.username,
    evolutions
  });

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(parseInt(resolveTypeTheme(pokemon.species.types[0]).primary.slice(1), 16))
        .setImage(`attachment://${INFO_CARD_FILE_NAME}`)
        .setFooter({ text: `Ref ${shortPokemonRef(pokemon.id)} | ${pokemon.species.name}` })
    ],
    files: [new AttachmentBuilder(image, { name: INFO_CARD_FILE_NAME })]
  };
}

async function loadNextEvolutions(services: AppServices, raw: unknown): Promise<EvolutionDisplay[]> {
  const rules = readEvolutionRules(raw).slice(0, 3);
  if (rules.length === 0) {
    return [];
  }

  const species = await services.prisma.pokemonSpecies.findMany({
    where: { slug: { in: rules.map((rule) => rule.to) } },
    select: {
      slug: true,
      name: true,
      spriteUrl: true,
      shinySpriteUrl: true,
      artworkUrl: true
    }
  });
  const speciesBySlug = new Map(species.map((entry) => [entry.slug, entry]));

  return rules.flatMap((rule) => {
    const entry = speciesBySlug.get(rule.to);
    return entry ? [{ ...entry, rule }] : [];
  });
}

async function renderPokemonInfoCard(input: {
  pokemon: PokemonInfoRecord;
  owner: Pick<User, "username" | "coins">;
  profile: PokemonInfoProfile;
  originalTrainerName: string;
  evolutions: EvolutionDisplay[];
}): Promise<Buffer> {
  const pokemonImageUrl = input.pokemon.shiny
    ? input.pokemon.species.shinySpriteUrl ?? input.pokemon.species.artworkUrl ?? input.pokemon.species.spriteUrl
    : input.pokemon.species.artworkUrl ?? input.pokemon.species.spriteUrl;
  const [pokemonImage, ...evolutionImages] = await Promise.all([
    fetchImageDataUri(pokemonImageUrl),
    ...input.evolutions.map((entry) => fetchImageDataUri(entry.artworkUrl ?? entry.spriteUrl))
  ]);
  const svg = buildPokemonInfoSvg(input, pokemonImage, evolutionImages);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function buildPokemonInfoSvg(
  input: {
    pokemon: PokemonInfoRecord;
    owner: Pick<User, "username" | "coins">;
    profile: PokemonInfoProfile;
    originalTrainerName: string;
    evolutions: EvolutionDisplay[];
  },
  pokemonImage: string | null,
  evolutionImages: Array<string | null>
): string {
  const pokemon = input.pokemon;
  const theme = resolveTypeTheme(pokemon.species.types[0]);
  const name = formatPokemonName(pokemon);
  const ivs = readStatTable(pokemon.ivs);
  const hpRatio = pokemon.maxHp > 0 ? clamp(pokemon.currentHp / pokemon.maxHp, 0, 1) : 0;
  const xpTarget = xpForNextLevel(pokemon.level);
  const xpRatio = clamp(pokemon.xp / xpTarget, 0, 1);
  const details: Array<[string, string]> = [
    ["Nature", pokemon.nature],
    ["Ability", pokemon.ability],
    ["Genero", formatGender(pokemon.gender)],
    ["OT", input.originalTrainerName],
    ["Origem", formatOrigin(pokemon)],
    ["Captura", formatDateTime(pokemon.createdAt)],
    ["Status", formatStatus(pokemon.status)],
    ["Evolucao", input.evolutions[0] ? formatEvolutionRule(input.evolutions[0].rule, input.evolutions[0].name) : "Linha final"]
  ];
  const ballLabel = pokemon.caughtBallName ?? "Sem registro";
  const favoriteLabel = pokemon.isFavorite ? "Favorito: Sim" : "Favorito: Nao";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${INFO_CARD_WIDTH}" height="${INFO_CARD_HEIGHT}" viewBox="0 0 ${INFO_CARD_WIDTH} ${INFO_CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="page-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0c111a"/>
      <stop offset="48%" stop-color="${theme.glow}"/>
      <stop offset="100%" stop-color="#06111f"/>
    </linearGradient>
    <radialGradient id="art-bg" cx="50%" cy="42%" r="70%">
      <stop offset="0%" stop-color="${theme.secondary}" stop-opacity="0.78"/>
      <stop offset="55%" stop-color="${theme.primary}" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="#120f16" stop-opacity="0.96"/>
    </radialGradient>
    <linearGradient id="panel-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#102235" stop-opacity="0.94"/>
      <stop offset="100%" stop-color="#07131f" stop-opacity="0.96"/>
    </linearGradient>
    <linearGradient id="hp-fill" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#4bd15a"/>
      <stop offset="100%" stop-color="#88ec43"/>
    </linearGradient>
    <linearGradient id="xp-fill" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2a97ef"/>
      <stop offset="100%" stop-color="#5ad6ff"/>
    </linearGradient>
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
    <filter id="image-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="22" flood-color="${theme.accent}" flood-opacity="0.55"/>
    </filter>
  </defs>

  <rect width="1536" height="1024" fill="url(#page-bg)"/>
  <rect x="15" y="15" width="1506" height="994" rx="26" fill="none" stroke="${theme.accent}" stroke-width="3" opacity="0.76"/>
  <path d="M 780 14 L 1520 14 L 1520 1010 L 648 1010 Z" fill="#061626" opacity="0.74"/>
  <path d="M 784 14 L 648 1010" stroke="${theme.accent}" stroke-width="3" opacity="0.52"/>

  <g filter="url(#soft-shadow)">
    <rect x="38" y="38" width="670" height="584" rx="18" fill="url(#art-bg)" stroke="${theme.accent}" stroke-width="2" opacity="0.98"/>
    ${buildEnergySpecks(theme)}
    ${buildPokemonImage(pokemonImage, pokemon.species.name)}
  </g>

  <g>
    ${buildBallIcon(82, 82, theme)}
    <text x="146" y="50" font-family="Consolas, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffe25d">#${String(pokemon.species.dexNumber).padStart(3, "0")}</text>
    <text x="146" y="101" font-family="Arial, sans-serif" font-size="54" font-weight="800" fill="#f8fbff">${escapeXml(truncate(pokemon.species.name, 18))}</text>
    <text x="146" y="146" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="${theme.accent}">${escapeXml(name.nicknameLine)}</text>
    ${buildTypeBadges(pokemon.species.types, 146, 168)}
  </g>

  <g>
    <rect x="38" y="628" width="608" height="138" rx="15" fill="#101820" stroke="#34465c" stroke-width="3" opacity="0.95"/>
    ${buildMainBar("HP", pokemon.currentHp, pokemon.maxHp, hpRatio, 62, 662, "url(#hp-fill)", "#75e867")}
    ${buildXpBar(pokemon.xp, xpTarget, xpRatio)}
  </g>

  <g>
    <text x="802" y="82" font-family="Consolas, Arial, sans-serif" font-size="58" font-weight="900" fill="#ffe1a3">Lv. ${pokemon.level}</text>
    <text x="1030" y="72" font-family="Arial, sans-serif" font-size="24" font-weight="800" fill="#f8fbff">${pokemon.shiny ? "SHINY" : "NORMAL"}</text>
    <text x="1168" y="72" font-family="Arial, sans-serif" font-size="24" font-weight="800" fill="#f8fbff">${escapeXml(favoriteLabel)}</text>
    ${buildBallIcon(1420, 68, theme)}
    <text x="1420" y="122" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#eef6ff">${escapeXml(ballLabel)}</text>
  </g>

  <g>
    <rect x="772" y="124" width="720" height="334" rx="14" fill="url(#panel-bg)" stroke="#25577c" stroke-width="2"/>
    ${details.map(([label, value], index) => buildDetailRow(label, value, 792, 154 + index * 38)).join("")}
  </g>

  <g>
    <rect x="672" y="476" width="326" height="290" rx="14" fill="url(#panel-bg)" stroke="#25577c" stroke-width="2"/>
    <text x="730" y="518" font-family="Arial, sans-serif" font-size="25" font-weight="800" fill="#c8d7e8">IVs</text>
    ${buildIvBars(ivs, 718, 548)}
  </g>

  <g>
    <rect x="1016" y="476" width="476" height="290" rx="14" fill="url(#panel-bg)" stroke="#25577c" stroke-width="2"/>
    <text x="1074" y="518" font-family="Arial, sans-serif" font-size="25" font-weight="800" fill="#c8d7e8">Moves</text>
    ${buildMoveGrid(pokemon.moves, pokemon.species.types)}
  </g>

  <g>
    <rect x="428" y="780" width="1064" height="200" rx="16" fill="url(#panel-bg)" stroke="#25577c" stroke-width="2"/>
    <text x="494" y="815" font-family="Arial, sans-serif" font-size="24" font-weight="800" fill="#c8d7e8">Linha de Evolucao</text>
    ${buildEvolutionLine(pokemon, pokemonImage, input.evolutions, evolutionImages, theme)}
    <text x="462" y="1005" font-family="Arial, sans-serif" font-size="17" fill="#93a9bd">Algumas evolucoes podem exigir itens ou requisitos especificos.</text>
  </g>
</svg>`;
}

function buildPokemonImage(image: string | null, speciesName: string): string {
  if (image) {
    return `<image href="${image}" x="170" y="142" width="470" height="470" preserveAspectRatio="xMidYMid meet" filter="url(#image-glow)"/>`;
  }

  return `
    <circle cx="405" cy="368" r="148" fill="#1b2d41" stroke="#41627d" stroke-width="5"/>
    <text x="405" y="382" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="#d8e6f6">${escapeXml(truncate(speciesName, 9))}</text>`;
}

function buildEnergySpecks(theme: TypeTheme): string {
  return Array.from({ length: 20 }, (_, index) => {
    const x = 68 + ((index * 83) % 590);
    const y = 84 + ((index * 137) % 500);
    const opacity = 0.24 + ((index % 5) * 0.11);
    return `<circle cx="${x}" cy="${y}" r="${2 + (index % 3)}" fill="${theme.accent}" opacity="${opacity.toFixed(2)}"/>`;
  }).join("");
}

function buildMainBar(label: string, current: number, max: number, ratio: number, x: number, y: number, fill: string, labelColor: string): string {
  const width = 356;
  const fillWidth = Math.round(width * ratio);

  return `
    <text x="${x}" y="${y + 26}" font-family="Arial, sans-serif" font-size="25" font-weight="800" fill="${labelColor}">${label}</text>
    <rect x="${x + 108}" y="${y + 5}" width="${width}" height="16" rx="4" fill="#293640"/>
    <rect x="${x + 108}" y="${y + 5}" width="${fillWidth}" height="16" rx="4" fill="${fill}"/>
    <text x="${x + 570}" y="${y + 27}" text-anchor="end" font-family="Consolas, Arial, sans-serif" font-size="26" font-weight="800" fill="#f8fbff">${current} / ${max}</text>`;
}

function buildXpBar(xp: number, target: number, ratio: number): string {
  const width = 356;
  const fillWidth = Math.round(width * ratio);

  return `
    <text x="62" y="728" font-family="Arial, sans-serif" font-size="25" font-weight="800" fill="#5ac9ff">XP</text>
    <rect x="170" y="707" width="${width}" height="10" rx="4" fill="#293640"/>
    <rect x="170" y="707" width="${fillWidth}" height="10" rx="4" fill="url(#xp-fill)"/>
    <text x="170" y="746" font-family="Arial, sans-serif" font-size="18" fill="#5ad6ff">${formatNumber(xp)} / ${formatNumber(target)} XP visual</text>
    <text x="590" y="728" text-anchor="end" font-family="Consolas, Arial, sans-serif" font-size="24" font-weight="800" fill="#f8fbff">Lv. ${xp >= target ? "up" : "..."}</text>`;
}

function buildDetailRow(label: string, value: string, x: number, y: number): string {
  return `
    <line x1="${x - 20}" y1="${y + 16}" x2="1470" y2="${y + 16}" stroke="#2b4a60" stroke-width="1"/>
    <text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="21" font-weight="800" fill="#9fb4ca">${escapeXml(label)}</text>
    <text x="${x + 248}" y="${y}" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#f8fbff">${escapeXml(truncate(value, 30))}</text>`;
}

function buildIvBars(ivs: StatTable, x: number, y: number): string {
  const rows: Array<[StatKey, string]> = [
    ["hp", "HP"],
    ["attack", "ATK"],
    ["defense", "DEF"],
    ["specialAttack", "SPA"],
    ["specialDefense", "SPD"],
    ["speed", "SPE"]
  ];

  return rows.map(([key, label], index) => {
    const value = ivs[key];
    const barWidth = Math.round((value / 31) * 154);
    const rowY = y + index * 34;
    const fill = value >= 28 ? "#67df35" : value >= 20 ? "#33bdf2" : "#f0b84f";
    return `
      <text x="${x}" y="${rowY + 18}" font-family="Consolas, Arial, sans-serif" font-size="21" font-weight="800" fill="#c8d7e8">${label}</text>
      <rect x="${x + 68}" y="${rowY + 3}" width="154" height="18" rx="3" fill="#263843"/>
      <rect x="${x + 68}" y="${rowY + 3}" width="${barWidth}" height="18" rx="3" fill="${fill}"/>
      <text x="${x + 258}" y="${rowY + 19}" text-anchor="end" font-family="Consolas, Arial, sans-serif" font-size="21" font-weight="800" fill="#f8fbff">${value}</text>`;
  }).join("");
}

function buildMoveGrid(moves: string[], types: string[]): string {
  const visibleMoves = Array.from({ length: 4 }, (_, index) => moves[index] ?? "Vazio");
  const positions: Array<[number, number]> = [
    [1038, 546],
    [1258, 546],
    [1038, 614],
    [1258, 614]
  ];

  return visibleMoves.map((move, index) => {
    const [x, y] = positions[index] ?? [1038, 546];
    const theme = resolveTypeTheme(types[index % Math.max(types.length, 1)]);
    const disabled = move === "Vazio";
    return `
      <rect x="${x}" y="${y}" width="202" height="50" rx="8" fill="${disabled ? "#182635" : theme.primary}" stroke="${disabled ? "#294057" : theme.accent}" stroke-width="2" opacity="${disabled ? "0.62" : "0.95"}"/>
      <text x="${x + 101}" y="${y + 33}" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="800" fill="#f8fbff">${escapeXml(truncate(move, 16))}</text>`;
  }).join("") + `
    <rect x="1038" y="682" width="202" height="76" rx="8" fill="#091724" stroke="#1c3e57" stroke-width="1"/>
    <text x="1139" y="713" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" fill="#a8b9ca">PP Max.</text>
    <text x="1139" y="746" text-anchor="middle" font-family="Consolas, Arial, sans-serif" font-size="25" font-weight="800" fill="#f8fbff">-- / --</text>
    <rect x="1258" y="682" width="202" height="76" rx="8" fill="#091724" stroke="#1c3e57" stroke-width="1"/>
    <text x="1359" y="713" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" fill="#a8b9ca">Tipo de Golpe</text>
    <text x="1359" y="746" text-anchor="middle" font-family="Arial, sans-serif" font-size="23" font-weight="800" fill="#f8fbff">Em breve</text>`;
}

function buildEvolutionLine(
  pokemon: PokemonInfoRecord,
  pokemonImage: string | null,
  evolutions: EvolutionDisplay[],
  evolutionImages: Array<string | null>,
  theme: TypeTheme
): string {
  const entries = [
    { name: pokemon.species.name, image: pokemonImage, current: true },
    ...evolutions.map((entry, index) => ({ name: entry.name, image: evolutionImages[index] ?? null, current: false }))
  ].slice(0, 4);
  const startX = 556;
  const gap = 235;

  return entries.map((entry, index) => {
    const cx = startX + index * gap;
    const image = entry.image
      ? `<image href="${entry.image}" x="${cx - 54}" y="840" width="108" height="88" preserveAspectRatio="xMidYMid meet"/>`
      : `<circle cx="${cx}" cy="884" r="42" fill="#1c3145"/>`;
    const ringStroke = entry.current ? theme.accent : "#315a7a";
    const arrow = index < entries.length - 1
      ? `<path d="M ${cx + 78} 884 L ${cx + 138} 884" stroke="#4f6d82" stroke-width="8"/><path d="M ${cx + 138} 884 L ${cx + 118} 868 L ${cx + 118} 900 Z" fill="#4f6d82"/>`
      : "";

    return `
      ${arrow}
      <circle cx="${cx}" cy="884" r="${entry.current ? 62 : 52}" fill="#091724" stroke="${ringStroke}" stroke-width="${entry.current ? 5 : 3}"/>
      ${image}
      <text x="${cx}" y="960" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="800" fill="${entry.current ? theme.accent : "#c8d7e8"}">${escapeXml(truncate(entry.name, 18))}</text>`;
  }).join("");
}

function buildTypeBadges(types: string[], x: number, y: number): string {
  return types.slice(0, 2).map((type, index) => {
    const theme = resolveTypeTheme(type);
    const badgeX = x + index * 124;
    return `
      <rect x="${badgeX}" y="${y}" width="108" height="34" rx="8" fill="${theme.primary}" stroke="${theme.accent}" stroke-width="2"/>
      <text x="${badgeX + 54}" y="${y + 24}" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="#f8fbff">${escapeXml(formatType(type))}</text>`;
  }).join("");
}

function buildBallIcon(cx: number, cy: number, theme: TypeTheme): string {
  return `
    <circle cx="${cx}" cy="${cy}" r="42" fill="#f3f6f8" stroke="#07111d" stroke-width="5"/>
    <path d="M ${cx - 39} ${cy} A 39 39 0 0 1 ${cx + 39} ${cy}" fill="${theme.primary}" stroke="#07111d" stroke-width="5"/>
    <line x1="${cx - 41}" y1="${cy}" x2="${cx + 41}" y2="${cy}" stroke="#07111d" stroke-width="6"/>
    <circle cx="${cx}" cy="${cy}" r="14" fill="#f3f6f8" stroke="#07111d" stroke-width="5"/>`;
}

function readEvolutionRules(raw: unknown): EvolutionRule[] {
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
    if (typeof to !== "string" || typeof method !== "string") {
      return [];
    }

    return [{
      to,
      method,
      level: typeof source.level === "number" ? source.level : undefined,
      item: typeof source.item === "string" ? source.item : undefined,
      condition: typeof source.condition === "string" ? source.condition : undefined
    }];
  });
}

function formatEvolutionRule(rule: EvolutionRule, speciesName: string): string {
  if (rule.method === "level" && rule.level) {
    return `${speciesName} no Lv. ${rule.level}`;
  }
  if (rule.method === "item" && rule.item) {
    return `${speciesName} com ${formatItemSlug(rule.item)}`;
  }
  if (rule.condition) {
    return `${speciesName} - ${rule.condition}`;
  }

  return speciesName;
}

function readStatTable(raw: unknown): StatTable {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return STAT_KEYS.reduce((stats, key) => {
    const value = source[key];
    stats[key] = typeof value === "number" && Number.isFinite(value) ? value : 0;
    return stats;
  }, {} as StatTable);
}

function formatPokemonName(pokemon: Pick<PlayerPokemon, "nickname"> & { species: Pick<PokemonSpecies, "name"> }): { display: string; nicknameLine: string } {
  return {
    display: pokemon.nickname ? `${pokemon.nickname} (${pokemon.species.name})` : pokemon.species.name,
    nicknameLine: pokemon.nickname ? `"${pokemon.nickname}"` : "Sem apelido"
  };
}

function formatGender(gender: PokemonGender): string {
  switch (gender) {
    case PokemonGender.MALE:
      return "Masculino";
    case PokemonGender.FEMALE:
      return "Feminino";
    default:
      return "Sem genero";
  }
}

function formatStatus(status: PokemonStatus): string {
  switch (status) {
    case PokemonStatus.BURN:
      return "Queimado";
    case PokemonStatus.PARALYSIS:
      return "Paralisado";
    case PokemonStatus.SLEEP:
      return "Dormindo";
    case PokemonStatus.POISON:
      return "Envenenado";
    case PokemonStatus.FREEZE:
      return "Congelado";
    case PokemonStatus.FAINTED:
      return "Desmaiado";
    default:
      return "Normal";
  }
}

function formatOrigin(pokemon: Pick<PlayerPokemon, "originLabel" | "originChannelId">): string {
  if (pokemon.originLabel) {
    return pokemon.originLabel;
  }

  if (pokemon.originChannelId) {
    return `Canal ${pokemon.originChannelId} - Spawn`;
  }

  return "Registro antigo";
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatItemSlug(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatType(type: string): string {
  return type.toUpperCase();
}

function xpForNextLevel(level: number): number {
  return Math.max(100, level * 100);
}

function shortPokemonRef(id: string): string {
  return id.slice(0, 8);
}

function resolveTypeTheme(type: string | undefined): TypeTheme {
  const key = type?.toUpperCase() ?? "NORMAL";
  const normalTheme: TypeTheme = { primary: "#7f8792", secondary: "#c1c7cf", accent: "#e6edf5", glow: "#151922" };
  const themes: Record<string, TypeTheme> = {
    FIRE: { primary: "#d8401f", secondary: "#ff8d2b", accent: "#ffd35e", glow: "#261018" },
    WATER: { primary: "#277bc9", secondary: "#61c7ff", accent: "#9de8ff", glow: "#081b32" },
    GRASS: { primary: "#36a852", secondary: "#77db61", accent: "#c5ff85", glow: "#0b2118" },
    ELECTRIC: { primary: "#e0b229", secondary: "#ffe96c", accent: "#fff2a3", glow: "#272110" },
    NORMAL: normalTheme,
    FLYING: { primary: "#4a85d5", secondary: "#9fd5ff", accent: "#d6f0ff", glow: "#0b1d31" },
    POISON: { primary: "#884fc6", secondary: "#c17cff", accent: "#e7c7ff", glow: "#1d0f2e" },
    BUG: { primary: "#7ea629", secondary: "#bed85b", accent: "#efffa1", glow: "#172112" },
    GROUND: { primary: "#b77d35", secondary: "#e5be6b", accent: "#ffe2a4", glow: "#261a10" },
    ROCK: { primary: "#8d7342", secondary: "#c6ae70", accent: "#efdc9e", glow: "#1e1a12" },
    PSYCHIC: { primary: "#d14f87", secondary: "#ff93bd", accent: "#ffd1e4", glow: "#2a0f1c" },
    ICE: { primary: "#49aebe", secondary: "#a7f4ff", accent: "#dcfbff", glow: "#092026" },
    DRAGON: { primary: "#5b55d9", secondary: "#9b91ff", accent: "#d4ceff", glow: "#111136" },
    DARK: { primary: "#3d4555", secondary: "#7f8da4", accent: "#bcc9dc", glow: "#0e1118" },
    STEEL: { primary: "#687f93", secondary: "#adc5d5", accent: "#e1f0f8", glow: "#101b22" },
    FAIRY: { primary: "#d760ad", secondary: "#ffaad7", accent: "#ffd9ef", glow: "#2c1024" },
    FIGHTING: { primary: "#b84535", secondary: "#f18667", accent: "#ffd0b8", glow: "#29120f" },
    GHOST: { primary: "#6652a3", secondary: "#a28de0", accent: "#d9ceff", glow: "#161126" }
  };

  return themes[key] ?? normalTheme;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
