import { Prisma, type GameMap, type MapSpawn, type PokemonSpecies, type PrismaClient } from "@prisma/client";

export type CreateMapInput = {
  guildId: string;
  channelId: string;
  name: string;
  biome: string;
  description?: string;
  recommendedMinLevel?: number;
  recommendedMaxLevel?: number;
  createdByDiscordId?: string;
};

export type AddMapSpawnInput = {
  channelId: string;
  speciesSlug: string;
  weight: number;
  minLevel: number;
  maxLevel: number;
  shinyChance?: number;
  conditions?: Record<string, unknown>;
  rewards?: Record<string, unknown>;
};

export class MapService {
  constructor(private readonly prisma: PrismaClient) {}

  async createMap(input: CreateMapInput): Promise<GameMap> {
    return this.prisma.gameMap.upsert({
      where: { channelId: input.channelId },
      update: {
        guildId: input.guildId,
        name: input.name,
        biome: input.biome,
        description: input.description ?? null,
        recommendedMinLevel: input.recommendedMinLevel ?? 1,
        recommendedMaxLevel: input.recommendedMaxLevel ?? 5,
        isActive: true
      },
      create: {
        guildId: input.guildId,
        channelId: input.channelId,
        name: input.name,
        biome: input.biome,
        description: input.description ?? null,
        recommendedMinLevel: input.recommendedMinLevel ?? 1,
        recommendedMaxLevel: input.recommendedMaxLevel ?? 5,
        createdByDiscordId: input.createdByDiscordId
      }
    });
  }

  async addSpawn(input: AddMapSpawnInput): Promise<MapSpawn & { species: PokemonSpecies }> {
    const map = await this.prisma.gameMap.findUnique({ where: { channelId: input.channelId } });
    if (!map) {
      throw new Error("Este canal ainda não está registrado como mapa.");
    }

    const species = await this.prisma.pokemonSpecies.findUnique({ where: { slug: input.speciesSlug } });
    if (!species) {
      throw new Error(`Pokémon não encontrado no seed: ${input.speciesSlug}`);
    }

    const conditions = (input.conditions ?? {}) as Prisma.InputJsonObject;
    const rewards = (input.rewards ?? {}) as Prisma.InputJsonObject;

    const spawn = await this.prisma.mapSpawn.upsert({
      where: {
        mapId_speciesId: {
          mapId: map.id,
          speciesId: species.id
        }
      },
      update: {
        weight: input.weight,
        minLevel: input.minLevel,
        maxLevel: input.maxLevel,
        shinyChance: input.shinyChance ?? 0.000244,
        conditions,
        rewards,
        enabled: true
      },
      create: {
        mapId: map.id,
        speciesId: species.id,
        weight: input.weight,
        minLevel: input.minLevel,
        maxLevel: input.maxLevel,
        shinyChance: input.shinyChance ?? 0.000244,
        conditions,
        rewards
      }
    });

    return this.prisma.mapSpawn.findUniqueOrThrow({
      where: { id: spawn.id },
      include: { species: true }
    });
  }
}
