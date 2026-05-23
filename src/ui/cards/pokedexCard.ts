import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import sharp from "sharp";
import type { AppServices } from "../../services/createServices.js";
import type { PokedexDetails, PokedexListEntry } from "../../services/pokedex/PokedexService.js";
import { fetchImageDataUri } from "../assets/imageCache.js";

const INDEX_FILE_NAME = "pokedex-kanto.png";
const ENTRY_FILE_NAME = "pokedex-entry.png";
const INDEX_WIDTH = 1200;
const ENTRY_WIDTH = 960;
const ENTRY_HEIGHT = 640;

type PokedexPayload = {
  content?: string;
  embeds?: EmbedBuilder[];
  files?: AttachmentBuilder[];
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

    const image = await renderPokedexEntry(details);
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
  const listTop = 184;
  const height = listTop + rowsPerColumn * rowHeight + 120;
  const svg = buildKantoIndexSvg(entries, prefix, height, rowsPerColumn, rowHeight, listTop);

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function renderPokedexEntry(details: PokedexDetails): Promise<Buffer> {
  const imageData = await fetchImageDataUri(details.spriteUrl ?? details.artworkUrl);
  const svg = buildPokedexEntrySvg(details, imageData);
  return sharp(Buffer.from(svg)).png().toBuffer();
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
  <rect x="34" y="34" width="${INDEX_WIDTH - 68}" height="64" fill="#101010" stroke="#f6f6f6" stroke-width="3"/>
  ${buildTopButton(52, "AREA", "#84b9de")}
  ${buildTopButton(214, "KANTO", "#84b9de")}
  ${buildTopButton(412, "SIZE", "#84b9de")}
  ${buildTopButton(574, "CANCEL", "#df1f1f")}
  <rect x="40" y="118" width="${INDEX_WIDTH - 80}" height="${height - 196}" fill="#fff0bd" stroke="#12335a" stroke-width="5"/>
  <text x="68" y="158" font-family="Consolas, Arial, sans-serif" font-size="30" font-weight="900" fill="#173056">KANTO POKEDEX</text>
  <text x="${INDEX_WIDTH - 68}" y="158" text-anchor="end" font-family="Consolas, Arial, sans-serif" font-size="20" font-weight="800" fill="#9b1726">ID 1-151</text>
  ${rows}
  <text x="64" y="${height - 48}" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="#f9fbff">Use ${escapeXml(prefix)}dex 25 ou ${escapeXml(prefix)}dex pikachu</text>
  <text x="${INDEX_WIDTH - 64}" y="${height - 48}" text-anchor="end" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#f9fbff">Fonte: PokeAPI</text>
</svg>`;
}

function buildPokedexEntrySvg(details: PokedexDetails, imageData: string | null): string {
  const theme = resolveTypeColor(details.types[0]);
  const flavorLines = wrapText(details.flavorText, 58).slice(0, 7);
  const typeLabel = details.types.join(" / ").toUpperCase();
  const sprite = imageData
    ? `<image href="${imageData}" x="78" y="118" width="240" height="220" preserveAspectRatio="xMidYMid meet" image-rendering="pixelated"/>`
    : `<text x="198" y="242" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="800" fill="#16222d">${escapeXml(truncate(details.name, 12))}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${ENTRY_WIDTH}" height="${ENTRY_HEIGHT}" viewBox="0 0 ${ENTRY_WIDTH} ${ENTRY_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${ENTRY_WIDTH}" height="${ENTRY_HEIGHT}" fill="#162c4b"/>
  <rect x="12" y="12" width="${ENTRY_WIDTH - 24}" height="${ENTRY_HEIGHT - 24}" fill="#f0b331" stroke="#111111" stroke-width="7"/>
  <rect x="26" y="26" width="${ENTRY_WIDTH - 52}" height="62" fill="#111111" stroke="#f6f6f6" stroke-width="3"/>
  ${buildTopButton(44, "AREA", "#86bde7")}
  ${buildTopButton(206, "CRY", "#86bde7")}
  ${buildTopButton(368, "SIZE", "#86bde7")}
  ${buildTopButton(530, "CANCEL", "#df1f1f")}

  <rect x="36" y="104" width="${ENTRY_WIDTH - 72}" height="238" fill="#f2f2e8" stroke="#151515" stroke-width="4"/>
  <rect x="58" y="122" width="280" height="196" fill="${theme.light}" stroke="#1f2f3a" stroke-width="3"/>
  <circle cx="198" cy="220" r="88" fill="${theme.soft}" opacity="0.68"/>
  ${sprite}

  <text x="366" y="142" font-family="Consolas, Arial, sans-serif" font-size="26" font-weight="900" fill="#111111">ID ${details.dexNumber}</text>
  <text x="498" y="142" font-family="Arial, sans-serif" font-size="26" font-weight="900" fill="#111111">${escapeXml(truncate(details.name.toUpperCase(), 18))}</text>
  <text x="366" y="184" font-family="Arial, sans-serif" font-size="24" font-weight="800" fill="#111111">${escapeXml(truncate(details.genus.toUpperCase(), 24))}</text>
  <rect x="366" y="206" width="230" height="36" fill="${theme.badge}" stroke="#111111" stroke-width="2"/>
  <text x="481" y="231" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#ffffff">${escapeXml(truncate(typeLabel, 20))}</text>
  <text x="366" y="284" font-family="Consolas, Arial, sans-serif" font-size="24" font-weight="900" fill="#111111">HT</text>
  <text x="430" y="284" font-family="Consolas, Arial, sans-serif" font-size="24" font-weight="900" fill="#111111">${escapeXml(details.heightText)}</text>
  <text x="586" y="284" font-family="Consolas, Arial, sans-serif" font-size="24" font-weight="900" fill="#111111">WT</text>
  <text x="650" y="284" font-family="Consolas, Arial, sans-serif" font-size="24" font-weight="900" fill="#111111">${escapeXml(details.weightText)}</text>

  <rect x="36" y="362" width="${ENTRY_WIDTH - 72}" height="214" fill="#fff8dc" stroke="#151515" stroke-width="4"/>
  ${flavorLines.map((line, index) => `
    <text x="58" y="${410 + index * 26}" font-family="Consolas, Arial, sans-serif" font-size="22" font-weight="700" fill="#111111">${escapeXml(line)}</text>`).join("")}
  <text x="58" y="604" font-family="Arial, sans-serif" font-size="17" font-weight="800" fill="#233a52">Fonte: ${escapeXml(details.sourceLabel)} | ${escapeXml(details.sourceUrl)}</text>
</svg>`;
}

function buildTopButton(x: number, label: string, fill: string): string {
  return `
    <rect x="${x}" y="38" width="126" height="30" rx="0" fill="${fill}" stroke="#dff2ff" stroke-width="2"/>
    <text x="${x + 63}" y="60" text-anchor="middle" font-family="Consolas, Arial, sans-serif" font-size="18" font-weight="900" fill="#111111">${escapeXml(label)}</text>`;
}

function isListQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return ["kanto", "lista", "list", "indice", "index"].includes(normalized);
}

function resolveTypeColor(type: string | undefined): { primary: number; badge: string; light: string; soft: string } {
  const key = type?.toLowerCase() ?? "normal";
  const normal = { primary: 0xa0a29f, badge: "#7f837e", light: "#eeeeea", soft: "#c8cac4" };
  const colors: Record<string, { primary: number; badge: string; light: string; soft: string }> = {
    bug: { primary: 0x92bc2c, badge: "#7b9f23", light: "#e7f3ba", soft: "#bfdc6a" },
    dark: { primary: 0x595761, badge: "#595761", light: "#d5d4da", soft: "#8f8b9b" },
    dragon: { primary: 0x0c69c8, badge: "#0c69c8", light: "#c8dcf5", soft: "#73a7df" },
    electric: { primary: 0xf2d94e, badge: "#caa51a", light: "#fff1a6", soft: "#f4d94c" },
    fairy: { primary: 0xee90e6, badge: "#d36acb", light: "#fde0f9", soft: "#efa3e8" },
    fighting: { primary: 0xd3425f, badge: "#bd334f", light: "#f2c3cc", soft: "#df7d91" },
    fire: { primary: 0xfba54c, badge: "#dc6f20", light: "#ffe0bd", soft: "#f69e43" },
    flying: { primary: 0xa1bbec, badge: "#6f90ce", light: "#dce8ff", soft: "#a1bbec" },
    ghost: { primary: 0x5f6dbc, badge: "#505cab", light: "#d8dcff", soft: "#8790d1" },
    grass: { primary: 0x5fbd58, badge: "#449d43", light: "#d7f2d4", soft: "#80cf79" },
    ground: { primary: 0xda7c4d, badge: "#be6337", light: "#f2d3c0", soft: "#dc8b63" },
    ice: { primary: 0x75d0c1, badge: "#58b6a7", light: "#d9fbf5", soft: "#91ded1" },
    normal,
    poison: { primary: 0xb763cf, badge: "#9950ad", light: "#efd5f6", soft: "#c486d5" },
    psychic: { primary: 0xfa8581, badge: "#d8616c", light: "#ffe0df", soft: "#f49394" },
    rock: { primary: 0xc9bb8a, badge: "#9b8d5f", light: "#eee8d2", soft: "#d0c38f" },
    steel: { primary: 0x5695a3, badge: "#497f8b", light: "#d1e7eb", soft: "#85b7c0" },
    water: { primary: 0x539ddf, badge: "#3f83c4", light: "#dcefff", soft: "#8fc5f4" }
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
