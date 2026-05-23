import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import sharp from "sharp";

const KANTO_MAP_FILE_NAME = "kanto-map.png";
const MAP_WIDTH = 1536;
const MAP_HEIGHT = 1024;
const STATIC_MAP_PATH = path.join(process.cwd(), "assets", "maps", "kanto.png");
const MARKED_MAP_CACHE_LIMIT = 80;

type PointKind = "city" | "town" | "league" | "landmark" | "dungeon";

type MapPoint = {
  name: string;
  x: number;
  y: number;
  kind: PointKind;
  label?: LabelOptions;
};

type LabelOptions = {
  dx?: number;
  dy?: number;
  anchor?: "start" | "middle" | "end";
  width?: number;
  size?: number;
};

type RouteLabel = {
  name: string;
  x: number;
  y: number;
  width?: number;
};

type RoutePath = {
  path: string;
  kind?: "road" | "water" | "bridge";
};

type KantoMapPayload = {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
};

type KantoMapPayloadOptions = {
  currentLocationName?: string | null;
};

type RenderedMapBase = {
  buffer: Buffer;
  width: number;
  height: number;
  source: "asset" | "generated";
};

type StaticImageMarker = {
  names: string[];
  xRatio: number;
  yRatio: number;
};

type CurrentLocationMarker = {
  name: string;
  x: number;
  y: number;
};

let cachedKantoMapBase: RenderedMapBase | null = null;
const markedMapCache = new Map<string, Buffer>();

const CITY_POINTS: MapPoint[] = [
  { name: "Pallet Town", x: 450, y: 720, kind: "town", label: { dx: 26, dy: 28, anchor: "middle", width: 106 } },
  { name: "Viridian City", x: 372, y: 556, kind: "city", label: { dx: 72, dy: 2, anchor: "start", width: 116 } },
  { name: "Pewter City", x: 312, y: 244, kind: "city", label: { dx: -8, dy: -42, anchor: "middle", width: 106 } },
  { name: "Cerulean City", x: 920, y: 270, kind: "city", label: { dx: 36, dy: -36, anchor: "middle", width: 124 } },
  { name: "Vermilion City", x: 942, y: 615, kind: "city", label: { dx: -62, dy: 44, anchor: "middle", width: 128 } },
  { name: "Lavender Town", x: 1256, y: 402, kind: "town", label: { dx: -12, dy: 36, anchor: "middle", width: 132 } },
  { name: "Celadon City", x: 690, y: 442, kind: "city", label: { dx: -60, dy: -34, anchor: "middle", width: 118 } },
  { name: "Saffron City", x: 942, y: 452, kind: "city", label: { dx: 46, dy: -36, anchor: "middle", width: 120 } },
  { name: "Fuchsia City", x: 854, y: 806, kind: "city", label: { dx: -42, dy: -40, anchor: "middle", width: 120 } },
  { name: "Cinnabar Island", x: 420, y: 904, kind: "town", label: { dx: -18, dy: 48, anchor: "middle", width: 136 } },
  { name: "Indigo Plateau", x: 96, y: 390, kind: "league", label: { dx: 50, dy: 4, anchor: "start", width: 136 } }
];

const LANDMARK_POINTS: MapPoint[] = [
  { name: "Viridian Forest", x: 320, y: 430, kind: "landmark", label: { dx: 72, dy: -42, anchor: "start", width: 126, size: 12 } },
  { name: "Mt. Moon", x: 600, y: 210, kind: "dungeon", label: { dx: 4, dy: -42, anchor: "middle", width: 86, size: 12 } },
  { name: "Cerulean Cave", x: 820, y: 162, kind: "dungeon", label: { dx: -18, dy: -34, anchor: "middle", width: 122, size: 12 } },
  { name: "Power Plant", x: 1152, y: 222, kind: "landmark", label: { dx: 38, dy: -10, anchor: "start", width: 108, size: 12 } },
  { name: "Rock Tunnel", x: 1150, y: 324, kind: "dungeon", label: { dx: 36, dy: -18, anchor: "start", width: 104, size: 12 } },
  { name: "Pokemon Tower", x: 1292, y: 362, kind: "landmark", label: { dx: -28, dy: -36, anchor: "middle", width: 126, size: 12 } },
  { name: "Diglett's Cave", x: 428, y: 286, kind: "dungeon", label: { dx: 32, dy: -2, anchor: "start", width: 118, size: 12 } },
  { name: "Underground Path", x: 836, y: 382, kind: "landmark", label: { dx: -40, dy: 38, anchor: "middle", width: 146, size: 12 } },
  { name: "Silph Co.", x: 972, y: 520, kind: "landmark", label: { dx: 50, dy: 2, anchor: "start", width: 82, size: 12 } },
  { name: "Rocket Hideout", x: 612, y: 510, kind: "dungeon", label: { dx: -10, dy: 38, anchor: "middle", width: 128, size: 12 } },
  { name: "S.S. Anne", x: 984, y: 694, kind: "landmark", label: { dx: 42, dy: 0, anchor: "start", width: 86, size: 12 } },
  { name: "Safari Zone", x: 768, y: 742, kind: "landmark", label: { dx: -18, dy: -34, anchor: "middle", width: 102, size: 12 } },
  { name: "Seafoam Islands", x: 606, y: 902, kind: "dungeon", label: { dx: 16, dy: 38, anchor: "middle", width: 132, size: 12 } },
  { name: "Pokemon Mansion", x: 354, y: 946, kind: "dungeon", label: { dx: -16, dy: 38, anchor: "middle", width: 140, size: 12 } },
  { name: "Victory Road", x: 118, y: 506, kind: "dungeon", label: { dx: 36, dy: -32, anchor: "middle", width: 108, size: 12 } }
];

const ROUTE_PATHS: RoutePath[] = [
  { path: "M450 720 L372 556 L320 430 L312 244 L428 286 L600 210 L920 270 L942 452 L942 615 L854 806 L606 902 L420 904 L450 720" },
  { path: "M920 270 L1152 222 L1256 402 L942 452 L690 442" },
  { path: "M942 452 L942 615 L1256 402" },
  { path: "M942 615 L854 806 L1164 824 L1308 710 L1256 402" },
  { path: "M854 806 C786 844, 704 882, 606 902", kind: "water" },
  { path: "M450 720 C452 814, 420 860, 420 904", kind: "water" },
  { path: "M372 556 L96 390", kind: "road" },
  { path: "M690 442 L514 452 L514 792 L854 806", kind: "bridge" },
  { path: "M942 615 L942 522 L1100 522 L1100 620 L942 615", kind: "bridge" }
];

const ROUTE_LABELS: RouteLabel[] = [
  { name: "Route 1", x: 420, y: 650 },
  { name: "Route 2", x: 356, y: 488 },
  { name: "Route 3", x: 424, y: 248 },
  { name: "Route 4", x: 734, y: 222 },
  { name: "Route 5", x: 908, y: 360 },
  { name: "Route 6", x: 944, y: 538 },
  { name: "Route 7", x: 810, y: 450 },
  { name: "Route 8", x: 1110, y: 438 },
  { name: "Route 9", x: 1040, y: 238 },
  { name: "Route 10", x: 1204, y: 286, width: 68 },
  { name: "Route 11", x: 1066, y: 616, width: 68 },
  { name: "Route 12", x: 1280, y: 548, width: 68 },
  { name: "Route 13", x: 1240, y: 708, width: 68 },
  { name: "Route 14", x: 1116, y: 812, width: 68 },
  { name: "Route 15", x: 984, y: 798, width: 68 },
  { name: "Route 16", x: 570, y: 456, width: 68 },
  { name: "Route 17", x: 522, y: 642, width: 68 },
  { name: "Route 18", x: 666, y: 798, width: 68 },
  { name: "Route 19", x: 842, y: 906, width: 68 },
  { name: "Route 20", x: 522, y: 944, width: 68 },
  { name: "Route 21", x: 428, y: 834, width: 68 },
  { name: "Route 22", x: 236, y: 514, width: 68 },
  { name: "Route 23", x: 104, y: 438, width: 68 },
  { name: "Route 24", x: 904, y: 176, width: 68 },
  { name: "Route 25", x: 1070, y: 154, width: 68 }
];

const STATIC_IMAGE_MARKERS: StaticImageMarker[] = [
  { names: ["Pallet Town", "Pallet"], xRatio: 0.312, yRatio: 0.654 },
  { names: ["Viridian City", "Viridian"], xRatio: 0.3, yRatio: 0.469 },
  { names: ["Pewter City", "Pewter"], xRatio: 0.218, yRatio: 0.146 },
  { names: ["Cerulean City", "Cerulean"], xRatio: 0.667, yRatio: 0.254 },
  { names: ["Vermilion City", "Vermilion"], xRatio: 0.623, yRatio: 0.547 },
  { names: ["Lavender Town", "Lavender"], xRatio: 0.905, yRatio: 0.313 },
  { names: ["Celadon City", "Celadon"], xRatio: 0.517, yRatio: 0.398 },
  { names: ["Saffron City", "Saffron"], xRatio: 0.668, yRatio: 0.412 },
  { names: ["Fuchsia City", "Fuchsia"], xRatio: 0.505, yRatio: 0.711 },
  { names: ["Cinnabar Island", "Cinnabar"], xRatio: 0.205, yRatio: 0.825 },
  { names: ["Indigo Plateau", "Indigo"], xRatio: 0.064, yRatio: 0.318 },
  { names: ["Viridian Forest"], xRatio: 0.217, yRatio: 0.298 },
  { names: ["Mt. Moon", "Mt Moon", "Mount Moon"], xRatio: 0.487, yRatio: 0.185 },
  { names: ["Unknown Dungeon", "Cerulean Cave"], xRatio: 0.639, yRatio: 0.187 },
  { names: ["Battle Factory"], xRatio: 0.544, yRatio: 0.183 },
  { names: ["Diglett's Cave", "Digletts Cave"], xRatio: 0.278, yRatio: 0.234 },
  { names: ["Rock Tunnel"], xRatio: 0.784, yRatio: 0.34 },
  { names: ["Victory Road"], xRatio: 0.053, yRatio: 0.454 },
  { names: ["Seafoam Islands", "Seafoam"], xRatio: 0.401, yRatio: 0.793 },
  { names: ["Pokemon Mansion", "Mansion"], xRatio: 0.298, yRatio: 0.935 },
  { names: ["Route 1", "R1"], xRatio: 0.304, yRatio: 0.553 },
  { names: ["Route 2", "R2"], xRatio: 0.199, yRatio: 0.367 },
  { names: ["Route 3", "R3"], xRatio: 0.358, yRatio: 0.256 },
  { names: ["Route 4", "R4"], xRatio: 0.548, yRatio: 0.252 },
  { names: ["Route 5", "R5"], xRatio: 0.683, yRatio: 0.32 },
  { names: ["Route 6", "R6"], xRatio: 0.718, yRatio: 0.498 },
  { names: ["Route 7", "R7"], xRatio: 0.603, yRatio: 0.399 },
  { names: ["Route 8", "R8"], xRatio: 0.777, yRatio: 0.448 },
  { names: ["Route 9", "R9"], xRatio: 0.777, yRatio: 0.266 },
  { names: ["Route 10", "R10"], xRatio: 0.888, yRatio: 0.294 },
  { names: ["Route 11", "R11"], xRatio: 0.762, yRatio: 0.548 },
  { names: ["Route 12", "R12"], xRatio: 0.887, yRatio: 0.556 },
  { names: ["Route 13", "R13"], xRatio: 0.775, yRatio: 0.628 },
  { names: ["Route 14", "R14"], xRatio: 0.841, yRatio: 0.714 },
  { names: ["Route 15", "R15"], xRatio: 0.653, yRatio: 0.718 },
  { names: ["Route 16", "R16"], xRatio: 0.376, yRatio: 0.467 },
  { names: ["Route 17", "R17"], xRatio: 0.439, yRatio: 0.575 },
  { names: ["Route 18", "R18"], xRatio: 0.436, yRatio: 0.763 },
  { names: ["Route 19", "R19"], xRatio: 0.549, yRatio: 0.833 },
  { names: ["Route 20", "R20"], xRatio: 0.337, yRatio: 0.885 },
  { names: ["Route 21", "R21"], xRatio: 0.278, yRatio: 0.745 },
  { names: ["Route 22", "R22"], xRatio: 0.161, yRatio: 0.502 },
  { names: ["Route 23", "R23"], xRatio: 0.068, yRatio: 0.384 },
  { names: ["Route 24", "R24"], xRatio: 0.732, yRatio: 0.13 },
  { names: ["Route 25", "R25"], xRatio: 0.698, yRatio: 0.084 }
];

export async function buildKantoMapCardPayload(options: KantoMapPayloadOptions = {}): Promise<KantoMapPayload> {
  const image = await renderKantoMapPng(options.currentLocationName);
  const currentLocation = options.currentLocationName?.trim();
  const description = currentLocation
    ? `Canal atual vinculado a ${currentLocation}. O marcador vermelho mostra essa localizacao.`
    : "Regiao inicial de exploracao. Cidades, rotas e marcos aparecem direto no mapa.";

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0xb9c58b)
        .setTitle("Mapa de Kanto")
        .setDescription(description)
        .setImage(`attachment://${KANTO_MAP_FILE_NAME}`)
    ],
    files: [new AttachmentBuilder(image, { name: KANTO_MAP_FILE_NAME })]
  };
}

async function renderKantoMapPng(currentLocationName?: string | null): Promise<Buffer> {
  const base = await renderKantoMapBase();
  const locationName = currentLocationName?.trim();
  if (!locationName) {
    return base.buffer;
  }

  const marker = resolveLocationMarker(locationName, base);
  if (!marker) {
    return base.buffer;
  }

  const cacheKey = `${base.source}:${base.width}x${base.height}:${normalizeLocationKey(locationName)}`;
  const cached = markedMapCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const overlay = Buffer.from(buildCurrentLocationOverlay(base.width, base.height, marker));
  const image = await sharp(base.buffer)
    .composite([{ input: overlay, left: 0, top: 0 }])
    .png()
    .toBuffer();
  markedMapCache.set(cacheKey, image);

  if (markedMapCache.size > MARKED_MAP_CACHE_LIMIT) {
    const oldestKey = markedMapCache.keys().next().value;
    if (oldestKey) {
      markedMapCache.delete(oldestKey);
    }
  }

  return image;
}

async function renderKantoMapBase(): Promise<RenderedMapBase> {
  if (cachedKantoMapBase) {
    return cachedKantoMapBase;
  }

  const asset = await readStaticMapAsset();
  if (asset) {
    const metadata = await sharp(asset).metadata();
    cachedKantoMapBase = {
      buffer: asset,
      width: metadata.width ?? MAP_WIDTH,
      height: metadata.height ?? MAP_HEIGHT,
      source: "asset"
    };
    return cachedKantoMapBase;
  }

  cachedKantoMapBase = {
    buffer: await sharp(Buffer.from(buildKantoMapSvg())).png().toBuffer(),
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    source: "generated"
  };
  return cachedKantoMapBase;
}

async function readStaticMapAsset(): Promise<Buffer | null> {
  try {
    await access(STATIC_MAP_PATH);
    return await readFile(STATIC_MAP_PATH);
  } catch {
    return null;
  }
}

function resolveLocationMarker(locationName: string, base: RenderedMapBase): CurrentLocationMarker | null {
  const marker = base.source === "asset"
    ? findStaticImageMarker(locationName, base.width, base.height)
    : findGeneratedMapMarker(locationName);

  if (!marker) {
    return null;
  }

  return {
    name: locationName.trim(),
    x: clamp(marker.x, 28, base.width - 28),
    y: clamp(marker.y, 28, base.height - 28)
  };
}

function findStaticImageMarker(locationName: string, width: number, height: number): CurrentLocationMarker | null {
  const marker = findMarkerDefinition(locationName);
  return marker
    ? {
        name: locationName.trim(),
        x: marker.xRatio * width,
        y: marker.yRatio * height
      }
    : null;
}

function findGeneratedMapMarker(locationName: string): CurrentLocationMarker | null {
  const normalized = normalizeLocationKey(locationName);
  const routeNumber = readRouteNumber(normalized);
  if (routeNumber) {
    const route = ROUTE_LABELS.find((entry) => readRouteNumber(normalizeLocationKey(entry.name)) === routeNumber);
    return route ? { name: locationName.trim(), x: route.x, y: route.y } : null;
  }

  const points = [...CITY_POINTS, ...LANDMARK_POINTS];
  const exact = points.find((point) => normalizeLocationKey(point.name) === normalized);
  if (exact) {
    return { name: locationName.trim(), x: exact.x, y: exact.y };
  }

  const partial = points
    .map((point) => ({ point, key: normalizeLocationKey(point.name) }))
    .sort((left, right) => right.key.length - left.key.length)
    .find(({ key }) => normalized.includes(key) || key.includes(normalized));

  return partial ? { name: locationName.trim(), x: partial.point.x, y: partial.point.y } : null;
}

function findMarkerDefinition(locationName: string): StaticImageMarker | null {
  const normalized = normalizeLocationKey(locationName);
  const routeNumber = readRouteNumber(normalized);
  if (routeNumber) {
    return STATIC_IMAGE_MARKERS.find((marker) =>
      marker.names.some((name) => readRouteNumber(normalizeLocationKey(name)) === routeNumber)
    ) ?? null;
  }

  const aliases = STATIC_IMAGE_MARKERS.flatMap((marker) =>
    marker.names.map((name) => ({ marker, key: normalizeLocationKey(name) }))
  ).sort((left, right) => right.key.length - left.key.length);

  return aliases.find(({ key }) => normalized === key || normalized.includes(key) || key.includes(normalized))?.marker ?? null;
}

function buildCurrentLocationOverlay(width: number, height: number, marker: CurrentLocationMarker): string {
  const title = truncate(marker.name, 28);
  const label = `Voce esta aqui: ${title}`;
  const labelWidth = Math.min(width - 32, Math.max(230, label.length * 13 + 32));
  const labelHeight = 42;
  const labelX = clamp(marker.x - labelWidth / 2, 16, width - labelWidth - 16);
  const labelY = marker.y > 86 ? marker.y - 76 : marker.y + 34;
  const lineY = labelY > marker.y ? labelY : labelY + labelHeight;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="marker-shadow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#101010" flood-opacity="0.65"/>
    </filter>
  </defs>
  <line x1="${marker.x}" y1="${marker.y}" x2="${labelX + labelWidth / 2}" y2="${lineY}" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.78"/>
  <line x1="${marker.x}" y1="${marker.y}" x2="${labelX + labelWidth / 2}" y2="${lineY}" stroke="#d91616" stroke-width="3" stroke-linecap="round" opacity="0.94"/>
  <circle cx="${marker.x}" cy="${marker.y}" r="30" fill="#ff1f1f" opacity="0.22"/>
  <circle cx="${marker.x}" cy="${marker.y}" r="21" fill="#ff1f1f" opacity="0.36"/>
  <circle cx="${marker.x}" cy="${marker.y}" r="13" fill="#ff2b2b" stroke="#ffffff" stroke-width="5" filter="url(#marker-shadow)"/>
  <circle cx="${marker.x}" cy="${marker.y}" r="5" fill="#ffffff"/>
  <rect x="${labelX}" y="${labelY}" width="${labelWidth}" height="${labelHeight}" rx="8" fill="#f9f1c8" stroke="#8a2f2f" stroke-width="2" filter="url(#marker-shadow)"/>
  <text x="${labelX + labelWidth / 2}" y="${labelY + 28}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="900" fill="#531818">${escapeXml(label)}</text>
</svg>`;
}

function normalizeLocationKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/pokemon/gi, "pokemon")
    .replace(/\brota\s*0*(\d{1,2})\b/gi, "route $1")
    .replace(/\broute\s*0*(\d{1,2})\b/gi, "route $1")
    .replace(/\br\s*0*(\d{1,2})\b/gi, "route $1")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readRouteNumber(normalizedLocationName: string): number | null {
  const match = normalizedLocationName.match(/\broute\s+(\d{1,2})\b/);
  if (!match?.[1]) {
    return null;
  }

  const routeNumber = Number(match[1]);
  return Number.isInteger(routeNumber) && routeNumber >= 1 && routeNumber <= 25 ? routeNumber : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}.` : value;
}

function buildKantoMapSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${MAP_WIDTH}" height="${MAP_HEIGHT}" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c8e5eb"/>
      <stop offset="36%" stop-color="#8bc8d7"/>
      <stop offset="72%" stop-color="#43a1c9"/>
      <stop offset="100%" stop-color="#126caa"/>
    </linearGradient>
    <radialGradient id="land" cx="52%" cy="42%" r="72%">
      <stop offset="0%" stop-color="#e5dba6"/>
      <stop offset="24%" stop-color="#b9ca7e"/>
      <stop offset="53%" stop-color="#78a961"/>
      <stop offset="82%" stop-color="#557f52"/>
      <stop offset="100%" stop-color="#3c6548"/>
    </radialGradient>
    <linearGradient id="north-mountains" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e4dfd0"/>
      <stop offset="38%" stop-color="#a79b84"/>
      <stop offset="100%" stop-color="#5c554b"/>
    </linearGradient>
    <linearGradient id="road" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f8edb9"/>
      <stop offset="100%" stop-color="#dfc888"/>
    </linearGradient>
    <filter id="terrain-noise" x="-8%" y="-8%" width="116%" height="116%">
      <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="5" seed="39"/>
      <feColorMatrix type="saturate" values="0.26"/>
      <feBlend mode="multiply" in2="SourceGraphic"/>
    </filter>
    <filter id="paint-grain" x="-8%" y="-8%" width="116%" height="116%">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="17"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.55 0 0 0 0 0.55 0 0 0 0 0.55 0 0 0 0.18 0"/>
      <feBlend mode="overlay" in2="SourceGraphic"/>
    </filter>
    <filter id="label-shadow" x="-15%" y="-45%" width="130%" height="190%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#2b2b22" flood-opacity="0.5"/>
    </filter>
    <filter id="coast-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#123445" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="url(#sea)"/>
  ${buildSeaTexture()}
  <g filter="url(#coast-shadow)">
    ${buildLandMasses()}
    ${buildCoastalTrails()}
    ${buildMountainRanges()}
    ${buildForestTexture()}
    ${buildTownClusters()}
    ${ROUTE_PATHS.map(buildRoutePath).join("")}
    ${buildWaterRoutes()}
    ${ROUTE_LABELS.map(buildRouteLabel).join("")}
    ${LANDMARK_POINTS.map(buildMapPoint).join("")}
    ${CITY_POINTS.map(buildMapPoint).join("")}
  </g>
  <rect width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="none" filter="url(#paint-grain)" opacity="0.32"/>
</svg>`;
}

function buildLandMasses(): string {
  return `
    <path d="M42 314 C92 236, 174 196, 270 178 C384 86, 556 70, 704 108 C818 52, 996 76, 1120 158 C1250 172, 1378 272, 1402 418 C1490 540, 1428 724, 1284 824 C1168 924, 986 938, 856 872 C736 946, 570 932, 496 872 C396 902, 282 834, 226 750 C98 704, 20 584, 68 458 C30 414, 18 360, 42 314 Z" fill="url(#land)" stroke="#f4e9bb" stroke-width="6"/>
    <path d="M32 424 C64 396, 112 390, 154 414 L214 484 L180 584 L82 594 C34 548, 12 474, 32 424 Z" fill="#6b8d66" stroke="#e7ddab" stroke-width="5"/>
    <path d="M296 690 C378 694, 438 746, 456 822 C430 888, 356 924, 292 900 C224 870, 200 790, 230 734 C244 706, 266 694, 296 690 Z" fill="#719a60" stroke="#e7ddab" stroke-width="5"/>
    <path d="M322 918 C370 874, 464 872, 530 910 C548 966, 490 1000, 398 1008 C322 1002, 292 960, 322 918 Z" fill="#776f55" stroke="#eadfae" stroke-width="5"/>
    <path d="M566 906 C630 866, 706 862, 766 898 C748 952, 686 992, 610 986 C560 972, 538 938, 566 906 Z" fill="#777455" stroke="#eadfae" stroke-width="5"/>
    <path d="M1046 616 C1156 600, 1278 656, 1324 754 C1286 836, 1178 884, 1064 852 C982 812, 948 722, 984 658 C1000 632, 1018 620, 1046 616 Z" fill="#688c57" stroke="#e7ddab" stroke-width="5"/>`;
}

function buildCoastalTrails(): string {
  const trails = [
    "M86 326 C220 272, 396 224, 554 232 S858 188, 1092 194 S1358 328, 1360 478",
    "M126 642 C236 772, 384 832, 530 820 S790 850, 900 808 S1130 850, 1284 748",
    "M52 488 C138 530, 188 620, 264 700",
    "M972 184 C1130 206, 1238 300, 1284 410"
  ];

  return trails.map((path) => `<path d="${path}" fill="none" stroke="#f4e9c5" stroke-width="3" stroke-opacity="0.46"/>`).join("");
}

function buildMountainRanges(): string {
  const northRidge: Array<[number, number, number]> = [
    [70, 216, 96], [146, 186, 112], [228, 162, 118], [328, 146, 126], [452, 126, 108],
    [568, 126, 116], [714, 112, 126], [868, 102, 106], [1010, 124, 118], [1160, 164, 122], [1300, 236, 92]
  ];
  const westRidge: Array<[number, number, number]> = [[82, 388, 92], [118, 498, 106], [92, 638, 92], [174, 864, 82]];

  return [...northRidge, ...westRidge].map(([x, y, size]) => {
    const half = size / 2;
    return `
      <path d="M${x - half} ${y + half} L${x} ${y - half} L${x + half} ${y + half} Z" fill="url(#north-mountains)" stroke="#5b5044" stroke-width="3" opacity="0.9"/>
      <path d="M${x - 15} ${y - half + 34} L${x} ${y - half} L${x + 18} ${y - half + 38}" fill="none" stroke="#f3efe0" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.78"/>`;
  }).join("");
}

function buildForestTexture(): string {
  const groves: Array<[number, number, number, number]> = [
    [258, 388, 10, 8], [350, 500, 9, 7], [578, 382, 12, 6], [690, 526, 13, 6],
    [806, 316, 8, 4], [1070, 356, 10, 5], [1126, 660, 10, 6], [732, 714, 9, 5],
    [430, 704, 9, 5], [510, 848, 7, 4], [1020, 704, 8, 4], [234, 760, 6, 5]
  ];

  return groves.flatMap(([baseX, baseY, cols, rows]) =>
    Array.from({ length: cols * rows }, (_, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = baseX + col * 15 + (row % 2) * 7;
      const y = baseY + row * 13;
      return `<path d="M${x} ${y - 11} L${x - 10} ${y + 9} L${x + 10} ${y + 9} Z" fill="#315f38" stroke="#24492c" stroke-width="1" opacity="0.72"/>`;
    })
  ).join("");
}

function buildTownClusters(): string {
  const clusters: Array<[number, number, number]> = [
    [312, 244, 7], [920, 270, 8], [690, 442, 9], [942, 452, 10], [942, 615, 7],
    [854, 806, 8], [1256, 402, 6], [372, 556, 7], [450, 720, 5], [420, 904, 5],
    [96, 390, 4]
  ];

  return clusters.map(([x, y, count]) => {
    const houses = Array.from({ length: count }, (_, index) => {
      const hx = x - 34 + (index % 4) * 19;
      const hy = y + 18 + Math.floor(index / 4) * 17;
      return `
        <rect x="${hx}" y="${hy}" width="15" height="11" rx="1.5" fill="#d6c08a" stroke="#6b563f" stroke-width="1"/>
        <path d="M${hx - 2} ${hy} L${hx + 7.5} ${hy - 8} L${hx + 17} ${hy} Z" fill="#a95b48" stroke="#6b563f" stroke-width="1"/>`;
    }).join("");

    return `<g opacity="0.82">${houses}</g>`;
  }).join("");
}

function buildRoutePath(route: RoutePath): string {
  const outline = route.kind === "water" ? "#e9fbff" : route.kind === "bridge" ? "#3d342d" : "#24221c";
  const inner = route.kind === "water" ? "#8bd9ef" : route.kind === "bridge" ? "#eee6d7" : "url(#road)";
  const outlineWidth = route.kind === "bridge" ? 18 : 20;
  const innerWidth = route.kind === "bridge" ? 10 : 11;
  const dash = route.kind === "bridge" ? `stroke-dasharray="16 10"` : "";

  return `
    <path d="${route.path}" fill="none" stroke="${outline}" stroke-width="${outlineWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="0.82"/>
    <path d="${route.path}" fill="none" stroke="${inner}" stroke-width="${innerWidth}" stroke-linecap="round" stroke-linejoin="round" ${dash}/>`;
}

function buildWaterRoutes(): string {
  return `
    <path d="M420 904 C470 914, 540 920, 606 902 C694 880, 760 834, 854 806" fill="none" stroke="#f3fdff" stroke-width="4" stroke-dasharray="8 10" opacity="0.76"/>
    <path d="M450 720 C462 784, 448 846, 420 904" fill="none" stroke="#f3fdff" stroke-width="4" stroke-dasharray="8 10" opacity="0.76"/>`;
}

function buildMapPoint(point: MapPoint): string {
  const marker = point.kind === "city" || point.kind === "town" || point.kind === "league"
    ? buildCityMarker(point.x, point.y, point.kind)
    : point.kind === "dungeon"
      ? `<circle cx="${point.x}" cy="${point.y}" r="7" fill="#a5754d" stroke="#493225" stroke-width="3"/>`
      : `<circle cx="${point.x}" cy="${point.y}" r="7" fill="#6fd67c" stroke="#173b22" stroke-width="3"/>`;

  return `
    ${marker}
    ${buildNameLabel(point.name, point.x, point.y, point.label)}`;
}

function buildCityMarker(x: number, y: number, kind: PointKind): string {
  if (kind === "league") {
    return `
      <polygon points="${x},${y - 15} ${x + 15},${y} ${x},${y + 15} ${x - 15},${y}" fill="#f2c756" stroke="#162030" stroke-width="4"/>
      <circle cx="${x}" cy="${y}" r="6" fill="#fff7c8" stroke="#162030" stroke-width="2"/>`;
  }

  const fill = kind === "town" ? "#86bfd6" : "#e9eef1";
  return `
    <rect x="${x - 13}" y="${y - 13}" width="26" height="26" rx="4" fill="${fill}" stroke="#182536" stroke-width="4"/>
    <rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="2" fill="#415262" opacity="0.55"/>`;
}

function buildNameLabel(name: string, x: number, y: number, options: LabelOptions = {}): string {
  const anchor = options.anchor ?? "middle";
  const textX = x + (options.dx ?? 0);
  const textY = y + (options.dy ?? -24);
  const fontSize = options.size ?? 13;
  const width = options.width ?? Math.max(62, name.length * 7 + 16);
  const height = Math.max(19, fontSize + 7);
  const rectX = anchor === "middle" ? textX - width / 2 : anchor === "end" ? textX - width : textX;

  return `
    <rect x="${rectX}" y="${textY - height + 4}" width="${width}" height="${height}" rx="2" fill="#f3edc2" stroke="#58543d" stroke-width="1" filter="url(#label-shadow)" opacity="0.98"/>
    <text x="${textX}" y="${textY}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="900" fill="#17231f">${escapeXml(name)}</text>`;
}

function buildRouteLabel(route: RouteLabel): string {
  const width = route.width ?? 64;

  return `
    <rect x="${route.x - width / 2}" y="${route.y - 12}" width="${width}" height="21" rx="2" fill="#f3edc2" stroke="#58543d" stroke-width="1" filter="url(#label-shadow)" opacity="0.98"/>
    <text x="${route.x}" y="${route.y + 3}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="#17231f">${route.name}</text>`;
}

function buildSeaTexture(): string {
  return Array.from({ length: 18 }, (_, index) => {
    const y = 70 + index * 55;
    return `<path d="M-80 ${y} C170 ${y - 36}, 370 ${y + 40}, 620 ${y} S1000 ${y - 24}, 1220 ${y + 18} S1500 ${y - 20}, 1630 ${y + 14}" fill="none" stroke="#ffffff" stroke-width="${10 + (index % 4) * 5}" opacity="0.14"/>`;
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
