import type { GameMap, MapSpawn, PokemonSpecies, PrismaClient } from "@prisma/client";
import { REGION_DEFINITIONS, getRegionForDexNumber, type RegionKey } from "../../domain/pokemon/regions.js";
import { weightedChoice } from "../../utils/random.js";

type SpawnBucket = "manual" | "native" | "migrant" | "rare";
type BiomeKey = "grass" | "forest" | "cave" | "water" | "city" | "mountain" | "power" | "tower" | "mansion" | "safari" | "generic";

type MapWithSpawns = GameMap & {
  spawns: Array<MapSpawn & { species: PokemonSpecies }>;
};

export type SpawnPoolEntry = {
  species: PokemonSpecies;
  weight: number;
  minLevel: number;
  maxLevel: number;
  shinyChance: number;
  source: SpawnBucket;
};

export type SpeciesArea = {
  name: string;
  biome: string;
  minLevel: number;
  maxLevel: number;
  weight: number;
  source: SpawnBucket;
};

type SpeciesCache = {
  expiresAt: number;
  value: PokemonSpecies[];
};

type PoolCacheEntry = {
  expiresAt: number;
  mapUpdatedAt: number;
  manualSignature: string;
  value: SpawnPoolEntry[];
};

type AutoCandidate = {
  species: PokemonSpecies;
  source: Exclude<SpawnBucket, "manual">;
  factor: number;
};

const SPECIES_CACHE_TTL_MS = 1000 * 60 * 10;
const POOL_CACHE_TTL_MS = 1000 * 60;
const DEFAULT_SHINY_CHANCE = 0.000244;
const MAX_POTENTIAL_AREAS = 12;
const AUTO_BUCKET_TOTALS: Record<Exclude<SpawnBucket, "manual">, number> = {
  native: 70,
  migrant: 20,
  rare: 8
};

const BIOME_TYPE_MATCHES: Record<BiomeKey, string[]> = {
  grass: ["NORMAL", "FLYING", "BUG", "GRASS", "POISON", "GROUND", "FAIRY"],
  forest: ["BUG", "GRASS", "POISON", "FLYING", "NORMAL", "ELECTRIC", "FAIRY"],
  cave: ["ROCK", "GROUND", "POISON", "FLYING", "DARK", "GHOST", "STEEL"],
  water: ["WATER", "ICE", "DRAGON"],
  city: ["NORMAL", "ELECTRIC", "FLYING", "POISON", "FAIRY", "STEEL"],
  mountain: ["ROCK", "GROUND", "FIGHTING", "FIRE", "FLYING", "DRAGON", "ICE"],
  power: ["ELECTRIC", "STEEL"],
  tower: ["GHOST", "PSYCHIC", "POISON", "DARK"],
  mansion: ["FIRE", "POISON", "NORMAL", "GHOST", "DARK"],
  safari: ["NORMAL", "FLYING", "BUG", "GRASS", "POISON", "GROUND", "WATER", "ROCK"],
  generic: []
};

export class SpawnPoolService {
  private speciesCache: SpeciesCache | null = null;
  private readonly poolCache = new Map<string, PoolCacheEntry>();

  constructor(private readonly prisma: PrismaClient) {}

  async pickSpawn(map: MapWithSpawns): Promise<SpawnPoolEntry | null> {
    const pool = await this.buildPool(map);
    return weightedChoice(pool, (entry) => entry.weight);
  }

  async buildPool(map: MapWithSpawns): Promise<SpawnPoolEntry[]> {
    const manualSignature = buildManualSignature(map.spawns);
    const cached = this.poolCache.get(map.id);
    const now = Date.now();
    if (
      cached &&
      cached.expiresAt > now &&
      cached.mapUpdatedAt === map.updatedAt.getTime() &&
      cached.manualSignature === manualSignature
    ) {
      return cached.value;
    }

    const allSpecies = await this.loadSpecies();
    const pool = this.compilePool(map, allSpecies);
    this.poolCache.set(map.id, {
      expiresAt: now + POOL_CACHE_TTL_MS,
      mapUpdatedAt: map.updatedAt.getTime(),
      manualSignature,
      value: pool
    });

    return pool;
  }

  async describeSpeciesAreas(speciesSlug: string): Promise<SpeciesArea[]> {
    const species = await this.prisma.pokemonSpecies.findUnique({ where: { slug: speciesSlug } });
    if (!species) {
      return [];
    }

    const maps = await this.prisma.gameMap.findMany({
      where: { isActive: true },
      include: {
        spawns: {
          where: { enabled: true },
          include: { species: true }
        }
      },
      orderBy: { name: "asc" }
    });

    const areas = [];
    for (const map of maps) {
      const pool = await this.buildPool(map);
      const entry = pool.find((candidate) => candidate.species.slug === species.slug);
      if (entry) {
        areas.push({
          name: map.name,
          biome: map.biome,
          minLevel: entry.minLevel,
          maxLevel: entry.maxLevel,
          weight: entry.weight,
          source: entry.source
        });
      }
    }

    return areas
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
      .slice(0, MAX_POTENTIAL_AREAS);
  }

  clearCache(): void {
    this.speciesCache = null;
    this.poolCache.clear();
  }

  private async loadSpecies(): Promise<PokemonSpecies[]> {
    const now = Date.now();
    if (this.speciesCache && this.speciesCache.expiresAt > now) {
      return this.speciesCache.value;
    }

    const value = await this.prisma.pokemonSpecies.findMany({
      orderBy: { dexNumber: "asc" }
    });
    this.speciesCache = {
      expiresAt: now + SPECIES_CACHE_TTL_MS,
      value
    };

    return value;
  }

  private compilePool(map: MapWithSpawns, allSpecies: PokemonSpecies[]): SpawnPoolEntry[] {
    const manualEntries = map.spawns.map((spawn) => ({
      species: spawn.species,
      weight: Math.max(1, spawn.weight),
      minLevel: spawn.minLevel,
      maxLevel: spawn.maxLevel,
      shinyChance: spawn.shinyChance,
      source: "manual" as const
    }));
    const manualSlugs = new Set(manualEntries.map((entry) => entry.species.slug));
    const autoEntries = this.compileAutomaticEntries(map, allSpecies, manualSlugs);

    return [...manualEntries, ...autoEntries];
  }

  private compileAutomaticEntries(
    map: GameMap,
    allSpecies: PokemonSpecies[],
    manualSlugs: Set<string>
  ): SpawnPoolEntry[] {
    const mapRegion = resolveMapRegion(map);
    const biomes = resolveBiomeKeys(map);
    const candidates = allSpecies.flatMap((species): AutoCandidate[] => {
      if (manualSlugs.has(species.slug) || isRestrictedSpecial(species) || !speciesFitsBiome(species, biomes)) {
        return [];
      }

      const source = resolveSpawnBucket(species, mapRegion);
      const factor = rarityFactor(species);
      return [{ species, source, factor }];
    });

    return (["native", "migrant", "rare"] as const).flatMap((source) => {
      const bucketCandidates = candidates.filter((candidate) => candidate.source === source);
      const totalFactor = bucketCandidates.reduce((sum, candidate) => sum + candidate.factor, 0);
      if (bucketCandidates.length === 0 || totalFactor <= 0) {
        return [];
      }

      return bucketCandidates.map((candidate) => ({
        species: candidate.species,
        weight: Math.max(1, Math.round((AUTO_BUCKET_TOTALS[source] * candidate.factor * 100) / totalFactor)),
        minLevel: map.recommendedMinLevel,
        maxLevel: Math.max(map.recommendedMinLevel, map.recommendedMaxLevel),
        shinyChance: DEFAULT_SHINY_CHANCE,
        source
      }));
    });
  }
}

function resolveSpawnBucket(species: PokemonSpecies, mapRegion: RegionKey): Exclude<SpawnBucket, "manual"> {
  if (species.baseCatchRate <= 45) {
    return "rare";
  }

  return getRegionForDexNumber(species.dexNumber)?.key === mapRegion ? "native" : "migrant";
}

function resolveMapRegion(map: Pick<GameMap, "name" | "biome" | "description">): RegionKey {
  const source = normalizeText(`${map.name} ${map.biome} ${map.description ?? ""}`);
  return REGION_DEFINITIONS.find((region) =>
    region.aliases.some((alias) => source.includes(normalizeText(alias)))
  )?.key ?? "kanto";
}

function resolveBiomeKeys(map: Pick<GameMap, "name" | "biome">): Set<BiomeKey> {
  const source = normalizeText(`${map.name} ${map.biome}`);
  const keys = new Set<BiomeKey>();

  addBiomeKey(keys, source, "forest", ["forest", "floresta"]);
  addBiomeKey(keys, source, "cave", ["cave", "caverna", "tunnel", "tunel", "túnel", "moon"]);
  addBiomeKey(keys, source, "water", ["water", "agua", "água", "sea", "ilha", "island", "seafoam"]);
  addBiomeKey(keys, source, "city", ["city", "cidade", "town", "vila"]);
  addBiomeKey(keys, source, "mountain", ["mount", "mountain", "monte", "plateau", "victory road"]);
  addBiomeKey(keys, source, "power", ["power", "usina"]);
  addBiomeKey(keys, source, "tower", ["tower", "torre"]);
  addBiomeKey(keys, source, "mansion", ["mansion", "mansao", "mansão"]);
  addBiomeKey(keys, source, "safari", ["safari"]);
  addBiomeKey(keys, source, "grass", ["grass", "grama", "route", "rota", "campo"]);

  if (keys.size === 0) {
    keys.add("generic");
  }

  return keys;
}

function addBiomeKey(keys: Set<BiomeKey>, source: string, key: BiomeKey, aliases: string[]): void {
  if (aliases.some((alias) => source.includes(normalizeText(alias)))) {
    keys.add(key);
  }
}

function speciesFitsBiome(species: PokemonSpecies, biomes: Set<BiomeKey>): boolean {
  if (biomes.has("generic")) {
    return true;
  }

  const speciesTypes = new Set(species.types.map((type) => type.toUpperCase()));
  return [...biomes].some((biome) =>
    BIOME_TYPE_MATCHES[biome].some((type) => speciesTypes.has(type))
  );
}

function rarityFactor(species: PokemonSpecies): number {
  if (species.baseCatchRate >= 200) {
    return 1;
  }
  if (species.baseCatchRate >= 120) {
    return 0.7;
  }
  if (species.baseCatchRate >= 45) {
    return 0.35;
  }
  return 0.12;
}

function isRestrictedSpecial(species: PokemonSpecies): boolean {
  return species.baseCatchRate <= 3;
}

function buildManualSignature(spawns: Array<MapSpawn & { species: PokemonSpecies }>): string {
  return spawns
    .map((spawn) => `${spawn.id}:${spawn.updatedAt.getTime()}:${spawn.enabled}:${spawn.weight}`)
    .sort()
    .join("|");
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
