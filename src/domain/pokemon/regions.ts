export type RegionKey =
  | "kanto"
  | "johto"
  | "hoenn"
  | "sinnoh"
  | "unova"
  | "kalos"
  | "alola"
  | "galar"
  | "paldea";

export type RegionFilter = RegionKey | "national";

export type RegionDefinition = {
  key: RegionKey;
  label: string;
  dexLabel: string;
  minDex: number;
  maxDex: number;
  generation: number;
  aliases: string[];
};

export const REGION_DEFINITIONS: RegionDefinition[] = [
  {
    key: "kanto",
    label: "Kanto",
    dexLabel: "Pokédex de Kanto",
    minDex: 1,
    maxDex: 151,
    generation: 1,
    aliases: ["kanto"]
  },
  {
    key: "johto",
    label: "Johto",
    dexLabel: "Pokédex de Johto",
    minDex: 152,
    maxDex: 251,
    generation: 2,
    aliases: ["johto"]
  },
  {
    key: "hoenn",
    label: "Hoenn",
    dexLabel: "Pokédex de Hoenn",
    minDex: 252,
    maxDex: 386,
    generation: 3,
    aliases: ["hoenn"]
  },
  {
    key: "sinnoh",
    label: "Sinnoh",
    dexLabel: "Pokédex de Sinnoh",
    minDex: 387,
    maxDex: 493,
    generation: 4,
    aliases: ["sinnoh"]
  },
  {
    key: "unova",
    label: "Unova",
    dexLabel: "Pokédex de Unova",
    minDex: 494,
    maxDex: 649,
    generation: 5,
    aliases: ["unova"]
  },
  {
    key: "kalos",
    label: "Kalos",
    dexLabel: "Pokédex de Kalos",
    minDex: 650,
    maxDex: 721,
    generation: 6,
    aliases: ["kalos"]
  },
  {
    key: "alola",
    label: "Alola",
    dexLabel: "Pokédex de Alola",
    minDex: 722,
    maxDex: 809,
    generation: 7,
    aliases: ["alola"]
  },
  {
    key: "galar",
    label: "Galar/Hisui",
    dexLabel: "Pokédex de Galar/Hisui",
    minDex: 810,
    maxDex: 905,
    generation: 8,
    aliases: ["galar", "hisui"]
  },
  {
    key: "paldea",
    label: "Paldea",
    dexLabel: "Pokédex de Paldea",
    minDex: 906,
    maxDex: 1025,
    generation: 9,
    aliases: ["paldea"]
  }
];

const REGION_BY_KEY = new Map(REGION_DEFINITIONS.map((region) => [region.key, region]));

export function getRegionDefinition(region: RegionFilter): RegionDefinition | null {
  return region === "national" ? null : REGION_BY_KEY.get(region) ?? null;
}

export function getRegionForDexNumber(dexNumber: number): RegionDefinition | null {
  return REGION_DEFINITIONS.find((region) => dexNumber >= region.minDex && dexNumber <= region.maxDex) ?? null;
}

export function resolveRegionFilter(raw: string | undefined): RegionFilter | null {
  const key = normalizeRegionKey(raw ?? "");
  if (!key) {
    return null;
  }

  if (["national", "nacional", "global", "all", "todos", "todas"].includes(key)) {
    return "national";
  }

  return REGION_DEFINITIONS.find((region) =>
    region.aliases.some((alias) => normalizeRegionKey(alias) === key)
  )?.key ?? null;
}

export function formatRegionFilterLabel(region: RegionFilter): string {
  return region === "national" ? "National Dex" : getRegionDefinition(region)?.label ?? "National Dex";
}

function normalizeRegionKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
