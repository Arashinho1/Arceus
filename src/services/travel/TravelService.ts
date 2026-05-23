import { Prisma, type GameMap, type PrismaClient, type User } from "@prisma/client";

type LocationKind = "city" | "town" | "route" | "landmark" | "dungeon" | "league";
type TravelMethod = "walk" | "fly";

type KantoLocation = {
  name: string;
  kind: LocationKind;
  aliases: string[];
  flyTarget?: boolean;
};

type TravelProgress = {
  currentMapId?: string;
  currentChannelId?: string;
  currentName?: string;
  previousMapId?: string;
  previousChannelId?: string;
  previousName?: string;
  method?: TravelMethod;
  updatedAt?: string;
};

type TravelResult = {
  ok: true;
  message: string;
} | TravelFailure;

type TravelFailure = {
  ok: false;
  message: string;
};

const TRAVEL_PROGRESS_KEY = "travel";

const KANTO_LOCATIONS: KantoLocation[] = [
  loc("Pallet Town", "town", ["pallet", "cidade de pallet", "vila pallet"], true),
  loc("Route 1", "route", ["rota 1", "r1"]),
  loc("Viridian City", "city", ["viridian", "cidade de viridian"], true),
  loc("Route 2", "route", ["rota 2", "r2"]),
  loc("Viridian Forest", "landmark", ["floresta de viridian"]),
  loc("Pewter City", "city", ["pewter", "cidade de pewter"], true),
  loc("Route 3", "route", ["rota 3", "r3"]),
  loc("Mt. Moon", "dungeon", ["mt moon", "mount moon", "monte lua"]),
  loc("Route 4", "route", ["rota 4", "r4"]),
  loc("Cerulean City", "city", ["cerulean", "cidade de cerulean"], true),
  loc("Route 24", "route", ["rota 24", "r24"]),
  loc("Route 25", "route", ["rota 25", "r25"]),
  loc("Route 5", "route", ["rota 5", "r5"]),
  loc("Saffron City", "city", ["saffron", "cidade de saffron"], true),
  loc("Route 6", "route", ["rota 6", "r6"]),
  loc("Vermilion City", "city", ["vermilion", "cidade de vermilion"], true),
  loc("Route 11", "route", ["rota 11", "r11"]),
  loc("Diglett's Cave", "dungeon", ["digletts cave", "caverna diglett"]),
  loc("Route 9", "route", ["rota 9", "r9"]),
  loc("Power Plant", "landmark", ["usina", "powerplant"]),
  loc("Route 10", "route", ["rota 10", "r10"]),
  loc("Rock Tunnel", "dungeon", ["túnel rochoso"]),
  loc("Lavender Town", "town", ["lavender", "cidade de lavender", "vila lavender"], true),
  loc("Pokemon Tower", "landmark", ["torre pokemon"]),
  loc("Route 8", "route", ["rota 8", "r8"]),
  loc("Route 7", "route", ["rota 7", "r7"]),
  loc("Celadon City", "city", ["celadon", "cidade de celadon"], true),
  loc("Rocket Hideout", "landmark", ["esconderijo rocket"]),
  loc("Route 16", "route", ["rota 16", "r16"]),
  loc("Route 17", "route", ["rota 17", "r17"]),
  loc("Route 18", "route", ["rota 18", "r18"]),
  loc("Fuchsia City", "city", ["fuchsia", "cidade de fuchsia"], true),
  loc("Safari Zone", "landmark", ["zona safari"]),
  loc("Route 15", "route", ["rota 15", "r15"]),
  loc("Route 14", "route", ["rota 14", "r14"]),
  loc("Route 13", "route", ["rota 13", "r13"]),
  loc("Route 12", "route", ["rota 12", "r12"]),
  loc("S.S. Anne", "landmark", ["ss anne", "s s anne"]),
  loc("Route 19", "route", ["rota 19", "r19"]),
  loc("Seafoam Islands", "dungeon", ["seafoam", "ilhas seafoam"]),
  loc("Route 20", "route", ["rota 20", "r20"]),
  loc("Cinnabar Island", "town", ["cinnabar", "ilha cinnabar"], true),
  loc("Pokemon Mansion", "dungeon", ["mansion", "mansão pokemon"]),
  loc("Route 21", "route", ["rota 21", "r21"]),
  loc("Route 22", "route", ["rota 22", "r22"]),
  loc("Route 23", "route", ["rota 23", "r23"]),
  loc("Victory Road", "dungeon", ["estrada da vitória"]),
  loc("Indigo Plateau", "league", ["indigo", "planalto indigo"], true),
  loc("Cerulean Cave", "dungeon", ["unknown dungeon", "caverna de cerulean"])
];

const KANTO_CONNECTIONS: Array<[string, string]> = [
  ["Pallet Town", "Route 1"],
  ["Pallet Town", "Route 21"],
  ["Route 1", "Viridian City"],
  ["Viridian City", "Route 2"],
  ["Viridian City", "Route 22"],
  ["Route 2", "Viridian Forest"],
  ["Route 2", "Diglett's Cave"],
  ["Viridian Forest", "Pewter City"],
  ["Pewter City", "Route 3"],
  ["Route 3", "Mt. Moon"],
  ["Mt. Moon", "Route 4"],
  ["Route 4", "Cerulean City"],
  ["Cerulean City", "Route 24"],
  ["Route 24", "Route 25"],
  ["Cerulean City", "Route 5"],
  ["Cerulean City", "Route 9"],
  ["Cerulean City", "Cerulean Cave"],
  ["Route 5", "Saffron City"],
  ["Saffron City", "Route 6"],
  ["Saffron City", "Route 7"],
  ["Saffron City", "Route 8"],
  ["Route 6", "Vermilion City"],
  ["Vermilion City", "Route 11"],
  ["Vermilion City", "S.S. Anne"],
  ["Route 11", "Diglett's Cave"],
  ["Route 11", "Route 12"],
  ["Route 9", "Power Plant"],
  ["Route 9", "Route 10"],
  ["Route 10", "Rock Tunnel"],
  ["Rock Tunnel", "Lavender Town"],
  ["Lavender Town", "Pokemon Tower"],
  ["Lavender Town", "Route 8"],
  ["Lavender Town", "Route 12"],
  ["Route 7", "Celadon City"],
  ["Celadon City", "Rocket Hideout"],
  ["Celadon City", "Route 16"],
  ["Route 16", "Route 17"],
  ["Route 17", "Route 18"],
  ["Route 18", "Fuchsia City"],
  ["Fuchsia City", "Safari Zone"],
  ["Fuchsia City", "Route 15"],
  ["Fuchsia City", "Route 19"],
  ["Route 15", "Route 14"],
  ["Route 14", "Route 13"],
  ["Route 13", "Route 12"],
  ["Route 19", "Seafoam Islands"],
  ["Seafoam Islands", "Route 20"],
  ["Route 20", "Cinnabar Island"],
  ["Cinnabar Island", "Pokemon Mansion"],
  ["Cinnabar Island", "Route 21"],
  ["Route 22", "Route 23"],
  ["Route 23", "Victory Road"],
  ["Victory Road", "Indigo Plateau"]
];

const LOCATIONS_BY_KEY = new Map<string, KantoLocation>();
for (const location of KANTO_LOCATIONS) {
  LOCATIONS_BY_KEY.set(normalizeLocationKey(location.name), location);
  for (const alias of location.aliases) {
    LOCATIONS_BY_KEY.set(normalizeLocationKey(alias), location);
  }
}

const ADJACENCY_BY_KEY = buildAdjacency();

export class TravelService {
  constructor(private readonly prisma: PrismaClient) {}

  async travel(input: {
    guildId: string | null;
    channelId: string;
    discordId: string;
    username: string;
    destination: string;
    prefix: string;
  }): Promise<TravelResult> {
    const context = await this.loadContext(input);
    if (!context.ok) {
      return context;
    }

    const { sourceMap, sourceLocation, user, activeMaps } = context;
    const progressCheck = this.ensureProgressMatchesCurrentChannel(user, sourceMap, input.prefix);
    if (!progressCheck.ok) {
      return progressCheck;
    }

    const destination = input.destination.trim();
    if (!destination) {
      return {
        ok: true,
        message: this.describeTravel(sourceMap, sourceLocation, activeMaps, input.prefix)
      };
    }

    const targetMap = this.resolveWalkTarget(destination, sourceMap, sourceLocation, activeMaps, user, input.prefix);
    if (!targetMap.ok) {
      return targetMap;
    }

    await this.updateTravelProgress(user, sourceMap, targetMap.map, "walk");

    const targetLocation = resolveKantoLocation(targetMap.map.name);
    const nextLocations = targetLocation
      ? this.formatConfiguredNeighbors(targetLocation, activeMaps)
      : "nenhum canal vizinho configurado";

    return {
      ok: true,
      message: [
        `Você viajou de **${sourceMap.name}** para **${targetMap.map.name}**.`,
        `Siga para <#${targetMap.map.channelId}> para continuar a exploração.`,
        `De lá, locais possíveis: ${nextLocations}.`
      ].join("\n")
    };
  }

  async fly(input: {
    guildId: string | null;
    channelId: string;
    discordId: string;
    username: string;
    destination: string;
    prefix: string;
  }): Promise<TravelResult> {
    const context = await this.loadContext(input);
    if (!context.ok) {
      return context;
    }

    const { sourceMap, user, activeMaps } = context;
    const progressCheck = this.ensureProgressMatchesCurrentChannel(user, sourceMap, input.prefix);
    if (!progressCheck.ok) {
      return progressCheck;
    }

    const canFly = await this.findFlyPokemon(user.id);
    if (!canFly) {
      return {
        ok: false,
        message: "Você precisa ter na equipe um Pokémon que saiba **Fly** para usar esse comando."
      };
    }

    const destination = input.destination.trim();
    if (!destination) {
      const targets = this.findConfiguredFlyTargets(activeMaps)
        .map((map) => `**${map.name}** (<#${map.channelId}>)`)
        .join(", ");
      return {
        ok: true,
        message: targets
          ? `Use ${input.prefix}fly <cidade>. Destinos configurados: ${targets}.`
          : "Nenhuma cidade/vila com canal configurado está disponível para Fly."
      };
    }

    const target = this.resolveConfiguredMap(destination, activeMaps);
    if (!target) {
      return {
        ok: false,
        message: `Não encontrei essa cidade nos mapas configurados. Use ${input.prefix}fly para ver os destinos.`
      };
    }

    const targetLocation = resolveKantoLocation(target.name);
    if (!targetLocation?.flyTarget) {
      return {
        ok: false,
        message: "Fly só pode levar para cidades, vilas ou pontos principais com canal configurado."
      };
    }

    await this.updateTravelProgress(user, sourceMap, target, "fly");

    return {
      ok: true,
      message: [
        `${canFly.species.name} usou **Fly**.`,
        `Você voou de **${sourceMap.name}** para **${target.name}**.`,
        `Siga para <#${target.channelId}>.`
      ].join("\n")
    };
  }

  private async loadContext(input: {
    guildId: string | null;
    channelId: string;
    discordId: string;
    username: string;
  }): Promise<
    | {
        ok: true;
        user: User;
        sourceMap: GameMap;
        sourceLocation: KantoLocation;
        activeMaps: GameMap[];
      }
    | TravelFailure
  > {
    const sourceMap = await this.prisma.gameMap.findUnique({ where: { channelId: input.channelId } });
    if (!sourceMap || !sourceMap.isActive) {
      return {
        ok: false,
        message: "Este canal não está registrado como uma localização ativa do mapa."
      };
    }

    const sourceLocation = resolveKantoLocation(sourceMap.name);
    if (!sourceLocation) {
      return {
        ok: false,
        message: `A localização **${sourceMap.name}** não foi reconhecida na rota de Kanto. Ajuste o nome do mapa ou registre uma localização válida.`
      };
    }

    const user = await this.prisma.user.upsert({
      where: { discordId: input.discordId },
      update: { username: input.username },
      create: {
        discordId: input.discordId,
        username: input.username
      }
    });

    const activeMaps = await this.prisma.gameMap.findMany({
      where: {
        isActive: true,
        ...(input.guildId ? { guildId: input.guildId } : {})
      },
      orderBy: { name: "asc" }
    });

    return {
      ok: true,
      user,
      sourceMap,
      sourceLocation,
      activeMaps
    };
  }

  private resolveWalkTarget(
    rawDestination: string,
    sourceMap: GameMap,
    sourceLocation: KantoLocation,
    activeMaps: GameMap[],
    user: User,
    prefix: string
  ): ({ ok: true; map: GameMap } | TravelFailure) {
    const normalizedDestination = normalizeLocationKey(rawDestination);
    const previousProgress = readTravelProgress(user.progress);

    if (["voltar", "back", "anterior", "retornar"].includes(normalizedDestination)) {
      if (!previousProgress.previousChannelId) {
        return {
          ok: false,
          message: "Você ainda não tem uma localização anterior registrada."
        };
      }

      const previousMap = activeMaps.find((map) => map.channelId === previousProgress.previousChannelId);
      if (!previousMap) {
        return {
          ok: false,
          message: "Sua localização anterior não está mais configurada como mapa ativo."
        };
      }

      return this.ensureAdjacentTarget(sourceMap, sourceLocation, previousMap, activeMaps);
    }

    if (["ir", "proximo", "proxima", "avancar", "seguir"].includes(normalizedDestination)) {
      const neighbors = this.findConfiguredNeighbors(sourceLocation, activeMaps);
      if (neighbors.length === 1 && neighbors[0]) {
        return { ok: true, map: neighbors[0] };
      }

      return {
        ok: false,
        message: [
          "Essa localização tem mais de um caminho. Escolha o destino pelo nome.",
          this.describeTravel(sourceMap, sourceLocation, activeMaps, prefix)
        ].join("\n")
      };
    }

    const target = this.resolveConfiguredMap(rawDestination, activeMaps);
    if (!target) {
      return {
        ok: false,
        message: [
          "Não encontrei esse destino entre os canais de mapa configurados.",
          this.describeTravel(sourceMap, sourceLocation, activeMaps, prefix)
        ].join("\n")
      };
    }

    return this.ensureAdjacentTarget(sourceMap, sourceLocation, target, activeMaps);
  }

  private ensureAdjacentTarget(
    sourceMap: GameMap,
    sourceLocation: KantoLocation,
    targetMap: GameMap,
    activeMaps: GameMap[]
  ): ({ ok: true; map: GameMap } | TravelFailure) {
    const targetLocation = resolveKantoLocation(targetMap.name);
    if (!targetLocation) {
      return {
        ok: false,
        message: `O destino **${targetMap.name}** não foi reconhecido na rota de Kanto.`
      };
    }

    if (!areAdjacent(sourceLocation, targetLocation)) {
      const allowed = this.formatConfiguredNeighbors(sourceLocation, activeMaps);

      return {
        ok: false,
        message: allowed
          ? `Você não pode viajar direto de **${sourceMap.name}** para **${targetMap.name}**. Caminhos disponíveis: ${allowed}.`
          : `Você não pode viajar direto de **${sourceMap.name}** para **${targetMap.name}**. Nenhum vizinho está configurado.`
      };
    }

    return { ok: true, map: targetMap };
  }

  private describeTravel(
    sourceMap: GameMap,
    sourceLocation: KantoLocation,
    activeMaps: GameMap[],
    prefix: string
  ): string {
    const neighbors = this.findConfiguredNeighbors(sourceLocation, activeMaps);
    const formattedNeighbors = this.formatConfiguredMaps(neighbors);

    return [
      `Você está em **${sourceMap.name}**.`,
      `Locais possíveis: ${formattedNeighbors}.`,
      `Use ${prefix}viajar <destino> ou ${prefix}viajar voltar.`
    ].join("\n");
  }

  private formatConfiguredNeighbors(sourceLocation: KantoLocation, activeMaps: GameMap[]): string {
    return this.formatConfiguredMaps(this.findConfiguredNeighbors(sourceLocation, activeMaps));
  }

  private formatConfiguredMaps(maps: GameMap[]): string {
    return maps.length > 0
      ? maps.map((map) => `**${map.name}** (<#${map.channelId}>)`).join(", ")
      : "nenhum canal vizinho configurado";
  }

  private findConfiguredNeighbors(sourceLocation: KantoLocation, activeMaps: GameMap[]): GameMap[] {
    const neighborKeys = ADJACENCY_BY_KEY.get(normalizeLocationKey(sourceLocation.name)) ?? new Set<string>();
    return activeMaps.filter((map) => {
      const location = resolveKantoLocation(map.name);
      return location ? neighborKeys.has(normalizeLocationKey(location.name)) : false;
    });
  }

  private findConfiguredFlyTargets(activeMaps: GameMap[]): GameMap[] {
    return activeMaps.filter((map) => resolveKantoLocation(map.name)?.flyTarget);
  }

  private resolveConfiguredMap(rawDestination: string, activeMaps: GameMap[]): GameMap | null {
    const channelId = parseChannelId(rawDestination);
    if (channelId) {
      return activeMaps.find((map) => map.channelId === channelId) ?? null;
    }

    const requestedLocation = resolveKantoLocation(rawDestination);
    const requestedKey = requestedLocation ? normalizeLocationKey(requestedLocation.name) : normalizeLocationKey(rawDestination);

    return activeMaps.find((map) => {
      const location = resolveKantoLocation(map.name);
      return location
        ? normalizeLocationKey(location.name) === requestedKey
        : normalizeLocationKey(map.name) === requestedKey;
    }) ?? null;
  }

  private ensureProgressMatchesCurrentChannel(user: User, sourceMap: GameMap, prefix: string): TravelResult {
    const progress = readTravelProgress(user.progress);
    if (!progress.currentChannelId || progress.currentChannelId === sourceMap.channelId) {
      return { ok: true, message: "" };
    }

    const currentLocation = progress.currentName ?? `<#${progress.currentChannelId}>`;
    return {
      ok: false,
      message: [
        `Sua localização registrada é **${currentLocation}**.`,
        `Para evitar salto de mapa, use os comandos no canal correto ou use ${prefix}fly <cidade> se tiver um Pokémon com Fly.`
      ].join("\n")
    };
  }

  private async updateTravelProgress(
    user: User,
    sourceMap: GameMap,
    targetMap: GameMap,
    method: TravelMethod
  ): Promise<void> {
    const progress = readProgressObject(user.progress);
    const currentTravel = readTravelProgress(user.progress);
    const nextTravel: TravelProgress = {
      currentMapId: targetMap.id,
      currentChannelId: targetMap.channelId,
      currentName: targetMap.name,
      previousMapId: currentTravel.currentMapId ?? sourceMap.id,
      previousChannelId: currentTravel.currentChannelId ?? sourceMap.channelId,
      previousName: currentTravel.currentName ?? sourceMap.name,
      method,
      updatedAt: new Date().toISOString()
    };

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        progress: {
          ...progress,
          [TRAVEL_PROGRESS_KEY]: nextTravel
        } as Prisma.InputJsonObject
      }
    });
  }

  private async findFlyPokemon(userId: string): Promise<{ species: { name: string } } | null> {
    const team = await this.prisma.playerPokemon.findMany({
      where: {
        userId,
        isReleased: false,
        isInTeam: true
      },
      select: {
        moves: true,
        species: {
          select: { name: true }
        }
      }
    });

    return team.find((pokemon) => pokemon.moves.some((move) => normalizeMoveKey(move) === "fly")) ?? null;
  }
}

function loc(name: string, kind: LocationKind, aliases: string[] = [], flyTarget = false): KantoLocation {
  return { name, kind, aliases, flyTarget };
}

function buildAdjacency(): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const [leftName, rightName] of KANTO_CONNECTIONS) {
    const left = normalizeLocationKey(leftName);
    const right = normalizeLocationKey(rightName);
    addAdjacency(adjacency, left, right);
    addAdjacency(adjacency, right, left);
  }
  return adjacency;
}

function addAdjacency(adjacency: Map<string, Set<string>>, from: string, to: string): void {
  const neighbors = adjacency.get(from) ?? new Set<string>();
  neighbors.add(to);
  adjacency.set(from, neighbors);
}

function areAdjacent(left: KantoLocation, right: KantoLocation): boolean {
  return ADJACENCY_BY_KEY.get(normalizeLocationKey(left.name))?.has(normalizeLocationKey(right.name)) ?? false;
}

function resolveKantoLocation(value: string): KantoLocation | null {
  const normalized = normalizeLocationKey(value);
  const exact = LOCATIONS_BY_KEY.get(normalized);
  if (exact) {
    return exact;
  }

  const routeNumber = readRouteNumber(normalized);
  if (routeNumber) {
    return LOCATIONS_BY_KEY.get(`route ${routeNumber}`) ?? null;
  }

  const aliases = [...LOCATIONS_BY_KEY.entries()].sort((left, right) => right[0].length - left[0].length);
  return aliases.find(([key]) => normalized.includes(key) || key.includes(normalized))?.[1] ?? null;
}

function readTravelProgress(raw: Prisma.JsonValue): TravelProgress {
  const progress = readProgressObject(raw);
  const travel = progress[TRAVEL_PROGRESS_KEY];
  if (!isRecord(travel)) {
    return {};
  }

  return {
    currentMapId: readString(travel.currentMapId),
    currentChannelId: readString(travel.currentChannelId),
    currentName: readString(travel.currentName),
    previousMapId: readString(travel.previousMapId),
    previousChannelId: readString(travel.previousChannelId),
    previousName: readString(travel.previousName),
    method: travel.method === "walk" || travel.method === "fly" ? travel.method : undefined,
    updatedAt: readString(travel.updatedAt)
  };
}

function readProgressObject(raw: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return isRecord(raw) ? raw : {};
}

function isRecord(value: unknown): value is Record<string, Prisma.JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseChannelId(raw?: string): string | null {
  if (!raw) {
    return null;
  }

  const mention = raw.trim().match(/^<#(\d+)>$/);
  return mention?.[1] ?? (raw.trim().match(/^\d+$/) ? raw.trim() : null);
}

function normalizeMoveKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeLocationKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/pokemon/gi, "pokemon")
    .replace(/\brota\s*0*(\d{1,2})\b/gi, "route $1")
    .replace(/\broute\s*0*(\d{1,2})\b/gi, "route $1")
    .replace(/\br\s*0*(\d{1,2})\b/gi, "route $1")
    .replace(/\bcidade\s+de\s+/gi, "")
    .replace(/\bvila\s+/gi, "")
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
