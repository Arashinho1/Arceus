import { EncounterState, type Encounter, type MapSpawn, type PokemonSpecies, type PrismaClient } from "@prisma/client";
import { weightedChoice, rollChance } from "../../utils/random.js";
import { PokemonGeneratorService } from "../pokemon/PokemonGeneratorService.js";
import { type CooldownStore, InMemoryCooldownStore } from "./CooldownStore.js";
import { UserService } from "../users/UserService.js";

type SpawnWithSpecies = MapSpawn & { species: PokemonSpecies };

export type SpawnMessageInput = {
  guildId: string;
  channelId: string;
  userId: string;
  username: string;
  messageContent?: string;
};

export type SpawnResult = {
  encounter: Encounter;
  species: PokemonSpecies;
};

export class SpawnService {
  private readonly userService: UserService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly pokemonGenerator: PokemonGeneratorService,
    private readonly cooldownStore: CooldownStore = new InMemoryCooldownStore()
  ) {
    this.userService = new UserService(prisma);
  }

  async trySpawnFromMessage(input: SpawnMessageInput): Promise<SpawnResult | null> {
    const messageContent = input.messageContent?.trim() ?? "";
    if (messageContent.length < 3) {
      return null;
    }

    const map = await this.prisma.gameMap.findUnique({
      where: { channelId: input.channelId },
      include: {
        spawns: {
          where: { enabled: true },
          include: { species: true }
        }
      }
    });

    if (!map || !map.isActive || map.spawns.length === 0) {
      return null;
    }

    const activeEncounter = await this.prisma.encounter.findFirst({
      where: {
        channelId: input.channelId,
        state: EncounterState.ACTIVE,
        expiresAt: { gt: new Date() }
      }
    });

    if (activeEncounter) {
      return null;
    }

    const cooldownKey = `spawn:${input.guildId}:${input.channelId}`;
    if (await this.cooldownStore.isBlocked(cooldownKey)) {
      return null;
    }

    if (!rollChance(map.spawnChance)) {
      return null;
    }

    const selectedSpawn = weightedChoice(map.spawns, (spawn: SpawnWithSpecies) => spawn.weight);
    if (!selectedSpawn) {
      return null;
    }

    const user = await this.userService.ensureUser({
      discordId: input.userId,
      username: input.username
    });

    const generated = this.pokemonGenerator.generateWildPokemon(selectedSpawn.species, {
      minLevel: selectedSpawn.minLevel,
      maxLevel: selectedSpawn.maxLevel,
      shinyChance: selectedSpawn.shinyChance
    });

    const encounter = await this.prisma.encounter.create({
      data: {
        mapId: map.id,
        channelId: input.channelId,
        speciesId: generated.speciesId,
        level: generated.level,
        gender: generated.gender,
        shiny: generated.shiny,
        nature: generated.nature,
        ability: generated.ability,
        ivs: generated.ivs,
        evs: generated.evs,
        moves: generated.moves,
        currentHp: generated.currentHp,
        maxHp: generated.maxHp,
        status: generated.status,
        spawnedByUserId: user.id,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000)
      }
    });

    await this.cooldownStore.block(cooldownKey, map.spawnCooldownSeconds);

    return {
      encounter,
      species: selectedSpawn.species
    };
  }

  async attachMessage(encounterId: string, messageId: string): Promise<void> {
    await this.prisma.encounter.update({
      where: { id: encounterId },
      data: { messageId }
    });
  }
}
