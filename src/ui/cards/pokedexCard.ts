import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import sharp from "sharp";
import type { AppServices } from "../../services/createServices.js";
import type {
  PokedexDetails,
  PokedexEvolutionStage,
  PokedexListEntry
} from "../../services/pokedex/PokedexService.js";
import { fetchImageDataUri } from "../assets/imageCache.js";

const INDEX_FILE_NAME = "pokedex-kanto.png";
const ENTRY_FILE_NAME = "pokedex-entry.png";
const INDEX_WIDTH = 1200;
const ENTRY_WIDTH = 960;
const ENTRY_HEIGHT = 1000;

type PokedexPayload = {
  content?: string;
  embeds?: EmbedBuilder[];
  files?: AttachmentBuilder[];
};

type PokedexSpawnArea = {
  name: string;
  biome: string;
  minLevel: number;
  maxLevel: number;
  weight: number;
};

type TypeTheme = {
  primary: number;
  badge: string;
  light: string;
  soft: string;
  accent: string;
  deep: string;
};

type EvolutionRenderStage = PokedexEvolutionStage & {
  imageData: string | null;
};

export async function buildPokedexPayload(
  services: AppServices,
  prefix: string,
  rawArgs: string
): Promise<PokedexPayload> {
  try {
    const query = rawArgs.trim();
    if (!query || isListQuery(query)) {
      const entries = await services.pokedex.listKantoSpecies();
      const image = await renderKantoIndex(entries, prefix);
      return {
        embeds: [
          new EmbedBuilder()
            .setColor(0x2f80d0)
            .setTitle("Pokedex de Kanto")
            .setDescription(`Use \`${prefix}dex pikachu\` ou \`${prefix}dex 25\` para abrir uma ficha.`)
            .setImage(`attachment://${INDEX_FILE_NAME}`)
            .setFooter({ text: `Kanto: ${entries.length} especies | Fonte: PokeAPI` })
        ],
        files: [new AttachmentBuilder(image, { name: INDEX_FILE_NAME })]
      };
    }

    const details = await services.pokedex.getKantoDetails(query);
    if (!details) {
      return { content: `Nao encontrei essa especie na Pokedex de Kanto. Use \`${prefix}pokedex\` para ver a lista.` };
    }

    const areas = await loadConfiguredSpawnAreas(services, details.slug);
    const image = await renderPokedexEntry(details, areas);
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(resolveTypeColor(details.types[0]).primary)
          .setTitle(`ID ${details.dexNumber} - ${details.name}`)
          .setImage(`attachment://${ENTRY_FILE_NAME}`)
          .setFooter({ text: `${details.region} | Fonte: ${details.sourceLabel}` })
      ],
      files: [new AttachmentBuilder(image, { name: ENTRY_FILE_NAME })]
    };
  } catch (error) {
    console.error("Erro ao carregar Pokedex:", error);
    return { content: "Nao consegui consultar a Pokedex agora. Tente novamente em alguns instantes." };
  }
}

async function renderKantoIndex(entries: PokedexListEntry[], prefix: string): Promise<Buffer> {
  const columns = 3;
  const rowsPerColumn = Math.ceil(entries.length / columns);
  const rowHeight = 26;
  const listTop = 154;
  const height = listTop + rowsPerColumn * rowHeight + 120;
  const svg = buildKantoIndexSvg(entries, prefix, height, rowsPerColumn, rowHeight, listTop);

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function renderPokedexEntry(details: PokedexDetails, areas: PokedexSpawnArea[]): Promise<Buffer> {
  const visibleEvolutionStages = selectEvolutionStages(details.evolutionStages, details.slug);
  const [imageData, ...evolutionImages] = await Promise.all([
    fetchImageDataUri(details.spriteUrl ?? details.artworkUrl),
    ...visibleEvolutionStages.map((stage) => fetchImageDataUri(stage.spriteUrl ?? stage.artworkUrl))
  ]);
  const evolutionStages = visibleEvolutionStages.map((stage, index) => ({
    ...stage,
    imageData: evolutionImages[index] ?? null
  }));
  const hiddenEvolutionCount = Math.max(0, details.evolutionStages.length - visibleEvolutionStages.length);
  const svg = buildPokedexEntrySvg(details, imageData, areas, evolutionStages, hiddenEvolutionCount);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function selectEvolutionStages(stages: PokedexEvolutionStage[], currentSlug: string): PokedexEvolutionStage[] {
  if (stages.length <= 5) {
    return stages;
  }

  const currentIndex = stages.findIndex((stage) => stage.slug === currentSlug);
  if (currentIndex <= 3) {
    return stages.slice(0, 5);
  }

  const start = Math.max(1, currentIndex - 2);
  const rootStage = stages[0];
  return rootStage ? [rootStage, ...stages.slice(start, start + 4)].slice(0, 5) : stages.slice(start, start + 5);
}

async function loadConfiguredSpawnAreas(services: AppServices, speciesSlug: string): Promise<PokedexSpawnArea[]> {
  const spawns = await services.prisma.mapSpawn.findMany({
    where: {
      enabled: true,
      species: { slug: speciesSlug },
      map: { isActive: true }
    },
    include: {
      map: {
        select: {
          name: true,
          biome: true
        }
      }
    },
    take: 8
  });

  return spawns
    .map((spawn) => ({
      name: spawn.map.name,
      biome: spawn.map.biome,
      minLevel: spawn.minLevel,
      maxLevel: spawn.maxLevel,
      weight: spawn.weight
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
}

function buildKantoIndexSvg(
  entries: PokedexListEntry[],
  prefix: string,
  height: number,
  rowsPerColumn: number,
  rowHeight: number,
  listTop: number
): string {
  const rows = entries.map((entry, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const x = 48 + column * 374;
    const y = listTop + row * rowHeight;
    const fill = row % 2 === 0 ? "#fff7d5" : "#f5e9b5";

    return `
      <rect x="${x}" y="${y - 18}" width="338" height="24" fill="${fill}" stroke="#d0a23d" stroke-width="1"/>
      <text x="${x + 14}" y="${y}" font-family="Consolas, Arial, sans-serif" font-size="18" font-weight="800" fill="#19304e">ID ${entry.dexNumber}</text>
      <text x="${x + 84}" y="${y}" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#181818">${escapeXml(truncate(entry.name, 21))}</text>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${INDEX_WIDTH}" height="${height}" viewBox="0 0 ${INDEX_WIDTH} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shell" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f5cf54"/>
      <stop offset="60%" stop-color="#e29d25"/>
      <stop offset="100%" stop-color="#b84d1a"/>
    </linearGradient>
  </defs>
  <rect width="${INDEX_WIDTH}" height="${height}" fill="#1d3556"/>
  <rect x="18" y="18" width="${INDEX_WIDTH - 36}" height="${height - 36}" rx="0" fill="url(#shell)" stroke="#07101e" stroke-width="8"/>
  <rect x="40" y="42" width="${INDEX_WIDTH - 80}" height="${height - 120}" fill="#fff0bd" stroke="#12335a" stroke-width="5"/>
  <text x="68" y="104" font-family="Consolas, Arial, sans-serif" font-size="32" font-weight="900" fill="#173056">KANTO POKEDEX</text>
  <text x="${INDEX_WIDTH - 68}" y="104" text-anchor="end" font-family="Consolas, Arial, sans-serif" font-size="22" font-weight="800" fill="#9b1726">ID 1-151</text>
  ${rows}
  <text x="64" y="${height - 48}" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="#f9fbff">Use ${escapeXml(prefix)}dex 25 ou ${escapeXml(prefix)}dex pikachu</text>
  <text x="${INDEX_WIDTH - 64}" y="${height - 48}" text-anchor="end" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#f9fbff">Fonte: PokeAPI</text>
</svg>`;
}

function buildPokedexEntrySvg(
  details: PokedexDetails,
  imageData: string | null,
  areas: PokedexSpawnArea[],
  evolutionStages: EvolutionRenderStage[],
  hiddenEvolutionCount: number
): string {
  const theme = resolveTypeColor(details.types[0]);
  const flavorLines = wrapText(details.flavorText, 58).slice(0, 8);
  const typeLabel = details.types.join(" / ").toUpperCase();
  const sprite = imageData
    ? `<image href="${imageData}" x="80" y="72" width="236" height="204" preserveAspectRatio="xMidYMid meet" image-rendering="pixelated"/>`
    : `<text x="198" y="190" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="800" fill="#16222d">${escapeXml(truncate(details.name, 12))}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${ENTRY_WIDTH}" height="${ENTRY_HEIGHT}" viewBox="0 0 ${ENTRY_WIDTH} ${ENTRY_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="outer-shell" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8c94a"/>
      <stop offset="58%" stop-color="#efae24"/>
      <stop offset="100%" stop-color="#d78a18"/>
    </linearGradient>
    <linearGradient id="panel-fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fbfbf4"/>
      <stop offset="100%" stop-color="#ecece0"/>
    </linearGradient>
    <linearGradient id="desc-fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff7d7"/>
      <stop offset="100%" stop-color="#fff0bd"/>
    </linearGradient>
    <filter id="card-shadow" x="-5%" y="-5%" width="110%" height="120%">
      <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#000000" flood-opacity="0.26"/>
    </filter>
  </defs>
  <rect width="${ENTRY_WIDTH}" height="${ENTRY_HEIGHT}" fill="#102a49"/>
  <rect x="10" y="10" width="${ENTRY_WIDTH - 20}" height="${ENTRY_HEIGHT - 20}" fill="url(#outer-shell)" stroke="#07101e" stroke-width="7"/>
  <rect x="25" y="25" width="${ENTRY_WIDTH - 50}" height="${ENTRY_HEIGHT - 50}" fill="none" stroke="#ffd86c" stroke-width="2" opacity="0.72"/>

  <g filter="url(#card-shadow)">
    <rect x="36" y="34" width="${ENTRY_WIDTH - 72}" height="252" fill="url(#panel-fill)" stroke="#111820" stroke-width="4"/>
    <rect x="58" y="58" width="280" height="200" fill="${theme.light}" stroke="${theme.deep}" stroke-width="3"/>
    <circle cx="198" cy="158" r="88" fill="${theme.soft}" opacity="0.72"/>
    <circle cx="198" cy="158" r="116" fill="none" stroke="${theme.accent}" stroke-width="2" opacity="0.42"/>
  </g>
  ${sprite}

  <text x="366" y="68" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#53606b">ID</text>
  <text x="398" y="74" font-family="Consolas, Arial, sans-serif" font-size="34" font-weight="900" fill="${theme.deep}">${details.dexNumber}</text>
  <text x="498" y="74" font-family="Arial, sans-serif" font-size="31" font-weight="900" fill="#101820">${escapeXml(truncate(details.name.toUpperCase(), 17))}</text>
  <text x="366" y="116" font-family="Arial, sans-serif" font-size="24" font-weight="900" fill="${theme.deep}">${escapeXml(truncate(details.genus.toUpperCase(), 24))}</text>
  <rect x="366" y="136" width="230" height="38" fill="${theme.badge}" stroke="#111111" stroke-width="2"/>
  <text x="481" y="161" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#ffffff">${escapeXml(truncate(typeLabel, 20))}</text>
  ${buildMetricBlock(366, 204, "ALT", details.heightText, theme)}
  ${buildMetricBlock(586, 204, "PESO", details.weightText, theme)}

  ${buildAreasPanel(36, 304, areas, theme)}
  ${buildAbilitiesPanel(338, 304, details.abilities, theme)}
  ${buildStatsPanel(640, 304, details.baseStats, theme)}

  ${buildEvolutionPanel(36, 462, ENTRY_WIDTH - 72, evolutionStages, hiddenEvolutionCount, details.slug, theme)}

  <rect x="36" y="644" width="${ENTRY_WIDTH - 72}" height="280" fill="url(#desc-fill)" stroke="#111820" stroke-width="4"/>
  <rect x="36" y="644" width="${ENTRY_WIDTH - 72}" height="48" fill="#101820" opacity="0.94"/>
  <rect x="48" y="658" width="10" height="20" fill="${theme.accent}"/>
  <text x="68" y="683" font-family="Arial, sans-serif" font-size="24" font-weight="900" fill="#ffffff">DESCRICAO</text>
  ${flavorLines.map((line, index) => `
    <text x="58" y="${727 + index * 25}" font-family="Arial, sans-serif" font-size="21" font-weight="800" fill="#111111">${escapeXml(line)}</text>`).join("")}
  <text x="58" y="964" font-family="Arial, sans-serif" font-size="17" font-weight="800" fill="#233a52">Fonte: ${escapeXml(details.sourceLabel)} | ${escapeXml(details.sourceUrl)}</text>
</svg>`;
}

function buildEvolutionPanel(
  x: number,
  y: number,
  width: number,
  stages: EvolutionRenderStage[],
  hiddenCount: number,
  currentSlug: string,
  theme: TypeTheme
): string {
  const visibleStages = stages.slice(0, 5);
  const count = Math.max(visibleStages.length, 1);
  const cardWidth = Math.min(132, Math.floor((width - 40 - (count - 1) * 34) / count));
  const startX = x + Math.floor((width - (count * cardWidth + (count - 1) * 34)) / 2);
  const cardY = y + 54;
  const headerExtra = hiddenCount > 0 ? ` +${hiddenCount}` : "";

  if (visibleStages.length === 0) {
    return `
    ${buildPanelFrame(x, y, width, "EVOLUCAO", theme, 164)}
    <text x="${x + 20}" y="${y + 98}" font-family="Arial, sans-serif" font-size="22" font-weight="900" fill="${theme.deep}">Sem evolucao registrada.</text>`;
  }

  return `
  ${buildPanelFrame(x, y, width, `EVOLUCAO${headerExtra}`, theme, 164)}
  ${visibleStages.map((stage, index) => {
    const stageX = startX + index * (cardWidth + 34);
    const nextStage = visibleStages[index + 1];
    const isCurrent = stage.slug === currentSlug;
    const isDirectEvolution = nextStage ? nextStage.depth === stage.depth + 1 : false;
    const arrow = nextStage && isDirectEvolution
      ? buildEvolutionArrow(stageX + cardWidth, cardY + 48, 34, nextStage.triggerText, theme)
      : "";
    return `
    ${buildEvolutionStageCard(stageX, cardY, cardWidth, stage, isCurrent, theme)}
    ${arrow}`;
  }).join("")}`;
}

function buildEvolutionStageCard(
  x: number,
  y: number,
  width: number,
  stage: EvolutionRenderStage,
  isCurrent: boolean,
  theme: TypeTheme
): string {
  const stageTheme = resolveTypeColor(stage.types[0]);
  const border = isCurrent ? theme.deep : "#41505c";
  const strokeWidth = isCurrent ? 4 : 2;
  const fill = isCurrent ? stageTheme.light : "#fbfbf4";
  const image = stage.imageData
    ? `<image href="${stage.imageData}" x="${x + Math.floor((width - 54) / 2)}" y="${y + 8}" width="54" height="48" preserveAspectRatio="xMidYMid meet" image-rendering="pixelated"/>`
    : `<circle cx="${x + width / 2}" cy="${y + 32}" r="22" fill="${stageTheme.soft}"/>`;

  return `
  <rect x="${x}" y="${y}" width="${width}" height="96" fill="${fill}" stroke="${border}" stroke-width="${strokeWidth}"/>
  ${image}
  <text x="${x + width / 2}" y="${y + 70}" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="900" fill="${isCurrent ? theme.deep : "#111111"}">${escapeXml(truncate(stage.name, 13))}</text>
  ${buildEvolutionTypeBadges(stage.types, x + 8, y + 78, width - 16)}`;
}

function buildEvolutionTypeBadges(types: string[], x: number, y: number, width: number): string {
  const visibleTypes = types.slice(0, 2);
  if (visibleTypes.length === 0) {
    return "";
  }

  const badgeWidth = visibleTypes.length === 1 ? width : Math.floor((width - 4) / 2);
  return visibleTypes.map((type, index) => {
    const theme = resolveTypeColor(type);
    const badgeX = x + index * (badgeWidth + 4);
    return `
    <rect x="${badgeX}" y="${y}" width="${badgeWidth}" height="14" fill="${theme.badge}" stroke="#111820" stroke-width="1"/>
    <text x="${badgeX + badgeWidth / 2}" y="${y + 11}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="900" fill="#ffffff">${escapeXml(truncate(type.toUpperCase(), 8))}</text>`;
  }).join("");
}

function buildEvolutionArrow(x: number, y: number, width: number, label: string | null, theme: TypeTheme): string {
  const centerY = y;
  return `
  <line x1="${x + 6}" y1="${centerY}" x2="${x + width - 8}" y2="${centerY}" stroke="${theme.deep}" stroke-width="3"/>
  <path d="M ${x + width - 8} ${centerY} L ${x + width - 16} ${centerY - 7} L ${x + width - 16} ${centerY + 7} Z" fill="${theme.deep}"/>
  <text x="${x + width / 2}" y="${centerY - 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="${theme.deep}">${escapeXml(truncate(label ?? "", 10))}</text>`;
}

function buildMetricBlock(x: number, y: number, label: string, value: string, theme: TypeTheme): string {
  return `
  <text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="17" font-weight="900" fill="#53606b">${escapeXml(label)}</text>
  <text x="${x + 58}" y="${y + 2}" font-family="Consolas, Arial, sans-serif" font-size="26" font-weight="900" fill="${theme.deep}">${escapeXml(value)}</text>`;
}

function buildPanelFrame(x: number, y: number, width: number, title: string, theme: TypeTheme, height = 140): string {
  return `
  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#panel-fill)" stroke="#111820" stroke-width="4"/>
  <rect x="${x}" y="${y}" width="${width}" height="42" fill="#101820" opacity="0.94"/>
  <rect x="${x + 12}" y="${y + 12}" width="8" height="18" fill="${theme.accent}"/>
  <text x="${x + 28}" y="${y + 30}" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#ffffff">${escapeXml(title)}</text>`;
}

function buildAreasPanel(x: number, y: number, areas: PokedexSpawnArea[], theme: TypeTheme): string {
  const visibleAreas = areas.slice(0, 3);
  const lines = visibleAreas.length > 0
    ? visibleAreas.map((area) => `${area.name} (${area.biome}) Lv.${area.minLevel}-${area.maxLevel}`)
    : ["Nao configurado"];
  const extra = areas.length > visibleAreas.length ? [`+${areas.length - visibleAreas.length} area(s)`] : [];

  return `
  ${buildPanelFrame(x, y, 286, "AREAS", theme)}
  ${[...lines, ...extra].slice(0, 4).map((line, index) => `
    <text x="${x + 20}" y="${y + 66 + index * 22}" font-family="Arial, sans-serif" font-size="17" font-weight="900" fill="${index === 0 ? theme.deep : "#111111"}">${escapeXml(truncate(line, 28))}</text>`).join("")}`;
}

function buildAbilitiesPanel(x: number, y: number, abilities: string[], theme: TypeTheme): string {
  const lines = abilities.length > 0 ? abilities : ["Unknown"];

  return `
  ${buildPanelFrame(x, y, 286, "HABILIDADES", theme)}
  ${lines.slice(0, 4).map((line, index) => `
    <text x="${x + 20}" y="${y + 66 + index * 22}" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="${index === 0 ? theme.deep : "#111111"}">${escapeXml(truncate(line, 27))}</text>`).join("")}`;
}

function buildStatsPanel(x: number, y: number, stats: PokedexDetails["baseStats"], theme: TypeTheme): string {
  const rows: Array<[string, number, number, number, number]> = [
    ["HP", stats.hp, x + 20, x + 72, y + 68],
    ["ATK", stats.attack, x + 20, x + 72, y + 94],
    ["DEF", stats.defense, x + 20, x + 72, y + 120],
    ["SPA", stats.specialAttack, x + 150, x + 204, y + 68],
    ["SPD", stats.specialDefense, x + 150, x + 204, y + 94],
    ["SPE", stats.speed, x + 150, x + 204, y + 120]
  ];

  return `
  ${buildPanelFrame(x, y, 284, "ATRIBUTOS BASE", theme)}
  ${rows.map(([label, value, labelX, valueX, rowY]) => `
    <text x="${labelX}" y="${rowY}" font-family="Consolas, Arial, sans-serif" font-size="19" font-weight="900" fill="#111111">${label}</text>
    <text x="${valueX}" y="${rowY}" font-family="Consolas, Arial, sans-serif" font-size="19" font-weight="900" fill="${resolveStatColor(value, theme)}">${value}</text>`).join("")}`;
}

function isListQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return ["kanto", "lista", "list", "indice", "index"].includes(normalized);
}

function resolveStatColor(value: number, theme: TypeTheme): string {
  if (value >= 90) {
    return "#17884f";
  }
  if (value >= 70) {
    return theme.deep;
  }
  if (value >= 50) {
    return "#9d6f00";
  }
  return "#4c5661";
}

function resolveTypeColor(type: string | undefined): TypeTheme {
  const key = type?.toLowerCase() ?? "normal";
  const normal: TypeTheme = {
    primary: 0xa0a29f,
    badge: "#70766f",
    light: "#eeeeea",
    soft: "#c8cac4",
    accent: "#cfd5cc",
    deep: "#4f5851"
  };
  const colors: Record<string, TypeTheme> = {
    bug: { primary: 0x92bc2c, badge: "#6d9120", light: "#e7f3ba", soft: "#bfdc6a", accent: "#d4ec74", deep: "#536f17" },
    dark: { primary: 0x595761, badge: "#595761", light: "#d5d4da", soft: "#8f8b9b", accent: "#b2afbd", deep: "#3e3c47" },
    dragon: { primary: 0x0c69c8, badge: "#0c69c8", light: "#c8dcf5", soft: "#73a7df", accent: "#76b8ff", deep: "#084b91" },
    electric: { primary: 0xf2d94e, badge: "#caa51a", light: "#fff1a6", soft: "#f4d94c", accent: "#ffe35a", deep: "#9b7600" },
    fairy: { primary: 0xee90e6, badge: "#d36acb", light: "#fde0f9", soft: "#efa3e8", accent: "#ffc2f4", deep: "#9d3996" },
    fighting: { primary: 0xd3425f, badge: "#bd334f", light: "#f2c3cc", soft: "#df7d91", accent: "#ff8ca0", deep: "#8c2137" },
    fire: { primary: 0xfba54c, badge: "#dc6f20", light: "#ffe0bd", soft: "#f69e43", accent: "#ffb565", deep: "#a84712" },
    flying: { primary: 0xa1bbec, badge: "#6f90ce", light: "#dce8ff", soft: "#a1bbec", accent: "#c2d8ff", deep: "#456aa5" },
    ghost: { primary: 0x5f6dbc, badge: "#505cab", light: "#d8dcff", soft: "#8790d1", accent: "#adb5ff", deep: "#374187" },
    grass: { primary: 0x5fbd58, badge: "#449d43", light: "#d7f2d4", soft: "#80cf79", accent: "#a9ed93", deep: "#2f7d2e" },
    ground: { primary: 0xda7c4d, badge: "#be6337", light: "#f2d3c0", soft: "#dc8b63", accent: "#f1ae83", deep: "#8d4522" },
    ice: { primary: 0x75d0c1, badge: "#58b6a7", light: "#d9fbf5", soft: "#91ded1", accent: "#adf3e9", deep: "#3a8d82" },
    normal,
    poison: { primary: 0xb763cf, badge: "#9950ad", light: "#efd5f6", soft: "#c486d5", accent: "#dda5ea", deep: "#783785" },
    psychic: { primary: 0xfa8581, badge: "#d8616c", light: "#ffe0df", soft: "#f49394", accent: "#ffb4b1", deep: "#a63d49" },
    rock: { primary: 0xc9bb8a, badge: "#9b8d5f", light: "#eee8d2", soft: "#d0c38f", accent: "#dfd19a", deep: "#756733" },
    steel: { primary: 0x5695a3, badge: "#497f8b", light: "#d1e7eb", soft: "#85b7c0", accent: "#aad5dc", deep: "#34636e" },
    water: { primary: 0x539ddf, badge: "#3f83c4", light: "#dcefff", soft: "#8fc5f4", accent: "#a7d9ff", deep: "#2e67a0" }
  };

  return colors[key] ?? normal;
}

function wrapText(value: string, maxChars: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}.` : value;
}

function escapeXml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
