import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import sharp from "sharp";

const KANTO_MAP_FILE_NAME = "kanto-map.png";
const MAP_WIDTH = 1536;
const MAP_HEIGHT = 1024;

type MapPoint = {
  name: string;
  shortName: string;
  x: number;
  y: number;
  kind: "city" | "town" | "league" | "landmark";
};

type RouteLabel = {
  name: string;
  x: number;
  y: number;
};

type KantoMapPayload = {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
};

let cachedKantoMap: Buffer | null = null;

const CITY_POINTS: MapPoint[] = [
  { name: "Pallet Town", shortName: "Pallet", x: 260, y: 812, kind: "town" },
  { name: "Viridian City", shortName: "Viridian", x: 260, y: 650, kind: "city" },
  { name: "Pewter City", shortName: "Pewter", x: 250, y: 424, kind: "city" },
  { name: "Cerulean City", shortName: "Cerulean", x: 600, y: 300, kind: "city" },
  { name: "Vermilion City", shortName: "Vermilion", x: 696, y: 632, kind: "city" },
  { name: "Lavender Town", shortName: "Lavender", x: 902, y: 468, kind: "town" },
  { name: "Celadon City", shortName: "Celadon", x: 506, y: 478, kind: "city" },
  { name: "Saffron City", shortName: "Saffron", x: 692, y: 478, kind: "city" },
  { name: "Fuchsia City", shortName: "Fuchsia", x: 660, y: 812, kind: "city" },
  { name: "Cinnabar Island", shortName: "Cinnabar", x: 408, y: 884, kind: "town" },
  { name: "Indigo Plateau", shortName: "Indigo", x: 134, y: 560, kind: "league" }
];

const LANDMARK_POINTS: MapPoint[] = [
  { name: "Viridian Forest", shortName: "Forest", x: 250, y: 520, kind: "landmark" },
  { name: "Mt. Moon", shortName: "Mt Moon", x: 414, y: 360, kind: "landmark" },
  { name: "Cerulean Cave", shortName: "Cave", x: 548, y: 244, kind: "landmark" },
  { name: "Power Plant", shortName: "Plant", x: 838, y: 304, kind: "landmark" },
  { name: "Rock Tunnel", shortName: "Tunnel", x: 838, y: 396, kind: "landmark" },
  { name: "Pokemon Tower", shortName: "Tower", x: 944, y: 420, kind: "landmark" },
  { name: "S.S. Anne", shortName: "S.S.", x: 728, y: 708, kind: "landmark" },
  { name: "Safari Zone", shortName: "Safari", x: 602, y: 770, kind: "landmark" },
  { name: "Seafoam Islands", shortName: "Seafoam", x: 524, y: 884, kind: "landmark" },
  { name: "Pokemon Mansion", shortName: "Mansion", x: 352, y: 936, kind: "landmark" }
];

const ROUTE_LABELS: RouteLabel[] = [
  { name: "R1", x: 276, y: 736 },
  { name: "R2", x: 276, y: 548 },
  { name: "R3", x: 342, y: 408 },
  { name: "R4", x: 512, y: 348 },
  { name: "R5", x: 632, y: 386 },
  { name: "R6", x: 688, y: 556 },
  { name: "R7", x: 590, y: 488 },
  { name: "R8", x: 798, y: 488 },
  { name: "R9", x: 724, y: 334 },
  { name: "R10", x: 874, y: 360 },
  { name: "R11", x: 800, y: 624 },
  { name: "R12", x: 926, y: 586 },
  { name: "R13", x: 908, y: 724 },
  { name: "R14", x: 836, y: 804 },
  { name: "R15", x: 748, y: 820 },
  { name: "R16", x: 396, y: 488 },
  { name: "R17", x: 410, y: 646 },
  { name: "R18", x: 528, y: 804 },
  { name: "R19", x: 654, y: 906 },
  { name: "R20", x: 500, y: 930 },
  { name: "R21", x: 332, y: 858 },
  { name: "R22", x: 192, y: 624 },
  { name: "R23", x: 142, y: 508 },
  { name: "R24", x: 604, y: 222 },
  { name: "R25", x: 724, y: 222 }
];

const KANTO_AREAS = [
  "Pallet Town", "Viridian City", "Pewter City", "Cerulean City", "Vermilion City", "Lavender Town",
  "Celadon City", "Saffron City", "Fuchsia City", "Cinnabar Island", "Indigo Plateau"
];

const KANTO_LANDMARKS = [
  "Viridian Forest", "Mt. Moon", "Cerulean Cave", "Power Plant", "Rock Tunnel", "Diglett's Cave",
  "Underground Path", "Pokemon Tower", "Silph Co.", "Rocket Hideout", "S.S. Anne", "Safari Zone",
  "Seafoam Islands", "Pokemon Mansion", "Victory Road"
];

export async function buildKantoMapCardPayload(): Promise<KantoMapPayload> {
  const image = await renderKantoMapPng();

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x4f8f64)
        .setTitle("Mapa de Kanto")
        .setDescription("Regiao inicial de exploracao. Use os canais configurados pelo staff para spawns.")
        .setImage(`attachment://${KANTO_MAP_FILE_NAME}`)
    ],
    files: [new AttachmentBuilder(image, { name: KANTO_MAP_FILE_NAME })]
  };
}

async function renderKantoMapPng(): Promise<Buffer> {
  if (cachedKantoMap) {
    return cachedKantoMap;
  }

  cachedKantoMap = await sharp(Buffer.from(buildKantoMapSvg())).png().toBuffer();
  return cachedKantoMap;
}

function buildKantoMapSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${MAP_WIDTH}" height="${MAP_HEIGHT}" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#07131d"/>
      <stop offset="55%" stop-color="#102d3d"/>
      <stop offset="100%" stop-color="#05121f"/>
    </linearGradient>
    <radialGradient id="land" cx="46%" cy="48%" r="74%">
      <stop offset="0%" stop-color="#78b86a"/>
      <stop offset="52%" stop-color="#3f8f59"/>
      <stop offset="100%" stop-color="#256447"/>
    </radialGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e6b90"/>
      <stop offset="100%" stop-color="#0b405f"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
    <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
      <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="url(#bg)"/>
  <rect x="22" y="22" width="1492" height="980" rx="26" fill="none" stroke="#6bb7df" stroke-width="3" opacity="0.58"/>
  <text x="64" y="88" font-family="Arial, sans-serif" font-size="46" font-weight="900" fill="#f7fbff">KANTO</text>
  <text x="65" y="124" font-family="Arial, sans-serif" font-size="22" fill="#b8d5e7">Mapa regional de exploracao</text>

  <g filter="url(#shadow)">
    <rect x="58" y="154" width="976" height="812" rx="22" fill="url(#sea)" stroke="#2f8ab8" stroke-width="3"/>
    <rect x="58" y="154" width="976" height="812" rx="22" fill="url(#grid)"/>
    <path d="M224 288 L620 210 L874 304 L956 488 L892 736 L690 886 L392 934 L194 830 L126 596 Z" fill="url(#land)" stroke="#9cdf88" stroke-width="5"/>
    <path d="M278 620 L456 620 L456 788 L620 788 L620 642 L760 642 L760 486 L900 486" fill="none" stroke="#efd78a" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
    <path d="M260 812 L260 650 L250 424 L414 360 L600 300 L692 478 L696 632 L660 812 L408 884 L260 812" fill="none" stroke="#ffe7a8" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M600 300 L838 304 L902 468 L692 478 L506 478" fill="none" stroke="#ffe7a8" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M660 812 L902 468" fill="none" stroke="#ffe7a8" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M260 650 L134 560" fill="none" stroke="#ffe7a8" stroke-width="10" stroke-linecap="round"/>
    <path d="M408 884 L524 884 L660 812" fill="none" stroke="#d4efff" stroke-width="12" stroke-linecap="round" opacity="0.84"/>
    ${ROUTE_LABELS.map(buildRouteLabel).join("")}
    ${LANDMARK_POINTS.map(buildMapPoint).join("")}
    ${CITY_POINTS.map(buildMapPoint).join("")}
  </g>

  <g>
    <rect x="1080" y="90" width="380" height="876" rx="20" fill="#091827" stroke="#2f6586" stroke-width="2"/>
    <text x="1110" y="138" font-family="Arial, sans-serif" font-size="27" font-weight="900" fill="#f7fbff">Locais principais</text>
    ${buildSideList(KANTO_AREAS, 1112, 184, "#cce9ff")}
    <text x="1110" y="504" font-family="Arial, sans-serif" font-size="27" font-weight="900" fill="#f7fbff">Marcos e dungeons</text>
    ${buildSideList(KANTO_LANDMARKS, 1112, 550, "#d5f8d1")}
    <rect x="1110" y="892" width="320" height="46" rx="12" fill="#123047" stroke="#2f6586" stroke-width="1"/>
    <text x="1270" y="922" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="800" fill="#d8efff">Rotas: 1 a 25</text>
  </g>
</svg>`;
}

function buildMapPoint(point: MapPoint): string {
  const fill = point.kind === "league" ? "#f0c75e" : point.kind === "landmark" ? "#7fd78a" : point.kind === "town" ? "#6bb7df" : "#f7fbff";
  const stroke = point.kind === "landmark" ? "#103820" : "#0b1b2b";
  const radius = point.kind === "landmark" ? 9 : 13;
  const fontSize = point.kind === "landmark" ? 16 : 18;
  const labelY = point.kind === "landmark" ? point.y - 14 : point.y - 20;

  return `
    <circle cx="${point.x}" cy="${point.y}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
    <text x="${point.x}" y="${labelY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="#f7fbff" stroke="#07131d" stroke-width="4" paint-order="stroke">${escapeXml(point.shortName)}</text>`;
}

function buildRouteLabel(route: RouteLabel): string {
  return `
    <rect x="${route.x - 18}" y="${route.y - 12}" width="36" height="22" rx="6" fill="#122b3c" stroke="#6bb7df" stroke-width="1" opacity="0.92"/>
    <text x="${route.x}" y="${route.y + 5}" text-anchor="middle" font-family="Consolas, monospace" font-size="14" font-weight="800" fill="#dff4ff">${route.name}</text>`;
}

function buildSideList(items: string[], x: number, startY: number, color: string): string {
  return items.map((item, index) => {
    const y = startY + index * 28;
    return `
      <circle cx="${x}" cy="${y - 7}" r="4" fill="${color}"/>
      <text x="${x + 16}" y="${y}" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="${color}">${escapeXml(item)}</text>`;
  }).join("");
}

function escapeXml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
