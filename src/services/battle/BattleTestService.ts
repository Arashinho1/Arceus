import {
  BattleEngine,
  BattleParticipantType,
  BattleState,
  Prisma,
  PokemonStatus,
  type PokemonSpecies,
  type PrismaClient
} from "@prisma/client";
import type { GeneratedWildPokemon, StatKey, StatTable } from "../../domain/pokemon/types.js";
import { getMoveDefinition } from "../../domain/battle/moves.js";
import { STAT_KEYS } from "../../domain/pokemon/types.js";
import { clamp, randomInt } from "../../utils/random.js";
import { PokemonGeneratorService } from "../pokemon/PokemonGeneratorService.js";

const TYPE_CHART: Record<string, Record<string, number>> = {
  NORMAL: { ROCK: 0.5, STEEL: 0.5, GHOST: 0 },
  FIRE: { GRASS: 2, ICE: 2, BUG: 2, STEEL: 2, WATER: 0.5, FIRE: 0.5, ROCK: 0.5, DRAGON: 0.5 },
  WATER: { FIRE: 2, ROCK: 2, GROUND: 2, GRASS: 0.5, WATER: 0.5, DRAGON: 0.5 },
  GRASS: { WATER: 2, ROCK: 2, GROUND: 2, FIRE: 0.5, GRASS: 0.5, POISON: 0.5, FLYING: 0.5, BUG: 0.5, DRAGON: 0.5, STEEL: 0.5 },
  ELECTRIC: { WATER: 2, FLYING: 2, GRASS: 0.5, ELECTRIC: 0.5, DRAGON: 0.5, GROUND: 0 },
  FLYING: { GRASS: 2, FIGHTING: 2, BUG: 2, ELECTRIC: 0.5, ROCK: 0.5, STEEL: 0.5 },
  POISON: { GRASS: 2, FAIRY: 2, POISON: 0.5, GROUND: 0.5, ROCK: 0.5, GHOST: 0.5, STEEL: 0 },
  GROUND: { FIRE: 2, ELECTRIC: 2, POISON: 2, ROCK: 2, STEEL: 2, GRASS: 0.5, BUG: 0.5, FLYING: 0 },
  ROCK: { FIRE: 2, ICE: 2, FLYING: 2, BUG: 2, FIGHTING: 0.5, GROUND: 0.5, STEEL: 0.5 },
  FIGHTING: { NORMAL: 2, ICE: 2, ROCK: 2, DARK: 2, STEEL: 2, POISON: 0.5, FLYING: 0.5, PSYCHIC: 0.5, BUG: 0.5, FAIRY: 0.5, GHOST: 0 },
  PSYCHIC: { FIGHTING: 2, POISON: 2, PSYCHIC: 0.5, STEEL: 0.5, DARK: 0 },
  DARK: { PSYCHIC: 2, GHOST: 2, FIGHTING: 0.5, DARK: 0.5, FAIRY: 0.5 },
  GHOST: { PSYCHIC: 2, GHOST: 2, DARK: 0.5, NORMAL: 0 },
  ICE: { GRASS: 2, GROUND: 2, FLYING: 2, DRAGON: 2, FIRE: 0.5, WATER: 0.5, ICE: 0.5, STEEL: 0.5 },
  DRAGON: { DRAGON: 2, STEEL: 0.5, FAIRY: 0 },
  BUG: { GRASS: 2, PSYCHIC: 2, DARK: 2, FIRE: 0.5, FIGHTING: 0.5, POISON: 0.5, FLYING: 0.5, GHOST: 0.5, STEEL: 0.5, FAIRY: 0.5 },
  STEEL: { ICE: 2, ROCK: 2, FAIRY: 2, FIRE: 0.5, WATER: 0.5, ELECTRIC: 0.5, STEEL: 0.5 },
  FAIRY: { FIGHTING: 2, DRAGON: 2, DARK: 2, FIRE: 0.5, POISON: 0.5, STEEL: 0.5 }
};

export type BattleTestInput = {
  discordId: string;
  username: string;
  minLevel?: number;
  maxLevel?: number;
};

export type BattleTestPokemon = {
  side: number;
  label: string;
  speciesName: string;
  level: number;
  ability: string;
  nature: string;
  moves: string[];
  maxHp: number;
  remainingHp: number;
  spriteUrl: string | null;
  summary: string;
};

export type BattleTestTurn = {
  turn: number;
  attacker: string;
  defender: string;
  move: string;
  damage: number;
  defenderRemainingHp: number;
  defenderMaxHp: number;
  effectiveness: number;
  critical: boolean;
};

export type BattleTestResult = {
  battleId: string;
  engine: BattleEngine;
  player: BattleTestPokemon;
  opponent: BattleTestPokemon;
  winnerSide: number;
  turns: BattleTestTurn[];
  mechanicsPreview: {
    player: string;
    opponent: string;
  };
};

type Combatant = {
  side: number;
  label: string;
  species: PokemonSpecies;
  generated: GeneratedWildPokemon;
  stats: StatTable;
  hp: number;
};

export class BattleTestService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pokemonGenerator: PokemonGeneratorService
  ) {}

  async createRandomBattle(input: BattleTestInput): Promise<BattleTestResult> {
    const minLevel = clamp(Math.floor(input.minLevel ?? 5), 1, 100);
    const maxLevel = clamp(Math.floor(input.maxLevel ?? 20), minLevel, 100);
    const selectedSpecies = await this.pickRandomSpeciesPair();

    const player = this.createCombatant("Jogador", 1, selectedSpecies.player, minLevel, maxLevel);
    const opponent = this.createCombatant("CPU", 2, selectedSpecies.opponent, minLevel, maxLevel);
    const simulation = this.simulateBattle(player, opponent);
    const mechanicsPreview = {
      player: this.buildPokemonSummary(player),
      opponent: this.buildPokemonSummary(opponent)
    };

    const user = await this.prisma.user.upsert({
      where: { discordId: input.discordId },
      update: { username: input.username },
      create: { discordId: input.discordId, username: input.username }
    });

    const battle = await this.prisma.battle.create({
      data: {
        engine: BattleEngine.LOCAL,
        state: BattleState.FINISHED,
        turnNumber: simulation.turns.length,
        data: {
          source: "battletest",
          createdByDiscordId: input.discordId,
          winnerSide: simulation.winnerSide,
          turns: simulation.turns,
          mechanicsPreview
        },
        participants: {
          create: [
            {
              type: BattleParticipantType.PLAYER,
              side: player.side,
              userId: user.id,
              activePokemonSnapshot: this.buildSnapshot(player, simulation.remainingHpBySide[player.side] ?? player.hp)
            },
            {
              type: BattleParticipantType.NPC,
              side: opponent.side,
              activePokemonSnapshot: this.buildSnapshot(
                opponent,
                simulation.remainingHpBySide[opponent.side] ?? opponent.hp
              )
            }
          ]
        }
      }
    });

    return {
      battleId: battle.id,
      engine: battle.engine,
      player: this.toResultPokemon(player, simulation.remainingHpBySide[player.side] ?? player.hp),
      opponent: this.toResultPokemon(opponent, simulation.remainingHpBySide[opponent.side] ?? opponent.hp),
      winnerSide: simulation.winnerSide,
      turns: simulation.turns,
      mechanicsPreview
    };
  }

  private async pickRandomSpeciesPair(): Promise<{ player: PokemonSpecies; opponent: PokemonSpecies }> {
    const species = await this.prisma.pokemonSpecies.findMany();
    if (species.length < 2) {
      throw new Error("Cadastre pelo menos duas espécies de Pokémon antes de usar o battletest.");
    }

    const firstIndex = randomInt(0, species.length - 1);
    let secondIndex = randomInt(0, species.length - 1);
    while (secondIndex === firstIndex) {
      secondIndex = randomInt(0, species.length - 1);
    }

    const player = species[firstIndex];
    const opponent = species[secondIndex];
    if (!player || !opponent) {
      throw new Error("Não foi possível sortear espécies para o battletest.");
    }

    return { player, opponent };
  }

  private createCombatant(
    label: string,
    side: number,
    species: PokemonSpecies,
    minLevel: number,
    maxLevel: number
  ): Combatant {
    const generated = this.pokemonGenerator.generateWildPokemon(species, {
      minLevel,
      maxLevel,
      shinyChance: 0
    });
    const stats = calculateStats(species, generated);

    return {
      side,
      label,
      species,
      generated,
      stats,
      hp: generated.maxHp
    };
  }

  private simulateBattle(first: Combatant, second: Combatant): {
    winnerSide: number;
    turns: BattleTestTurn[];
    remainingHpBySide: Record<number, number>;
  } {
    const turns: BattleTestTurn[] = [];
    const remainingHpBySide: Record<number, number> = {
      [first.side]: first.hp,
      [second.side]: second.hp
    };

    for (let round = 1; round <= 20; round += 1) {
      const firstMove = pickDamagingMove(first.generated.moves);
      const secondMove = pickDamagingMove(second.generated.moves);
      const order = this.getTurnOrder(first, firstMove, second, secondMove);
      for (const action of order) {
        const attacker = action.combatant;
        const defender = attacker.side === first.side ? second : first;
        if ((remainingHpBySide[attacker.side] ?? 0) <= 0 || (remainingHpBySide[defender.side] ?? 0) <= 0) {
          continue;
        }

        const attack = this.resolveAttack(attacker, defender, remainingHpBySide[defender.side] ?? defender.hp, action.moveName);
        remainingHpBySide[defender.side] = attack.defenderRemainingHp;
        turns.push({ turn: round, ...attack });

        if (attack.defenderRemainingHp <= 0) {
          return {
            winnerSide: attacker.side,
            turns,
            remainingHpBySide
          };
        }
      }
    }

    const winnerSide =
      (remainingHpBySide[first.side] ?? 0) >= (remainingHpBySide[second.side] ?? 0) ? first.side : second.side;

    return {
      winnerSide,
      turns,
      remainingHpBySide
    };
  }

  private getTurnOrder(
    first: Combatant,
    firstMoveName: string,
    second: Combatant,
    secondMoveName: string
  ): Array<{ combatant: Combatant; moveName: string }> {
    const firstMove = getMoveDefinition(firstMoveName);
    const secondMove = getMoveDefinition(secondMoveName);
    const firstAction = { combatant: first, moveName: firstMoveName };
    const secondAction = { combatant: second, moveName: secondMoveName };

    if ((firstMove.priority ?? 0) !== (secondMove.priority ?? 0)) {
      return (firstMove.priority ?? 0) > (secondMove.priority ?? 0) ? [firstAction, secondAction] : [secondAction, firstAction];
    }

    if (first.stats.speed === second.stats.speed) {
      return Math.random() < 0.5 ? [firstAction, secondAction] : [secondAction, firstAction];
    }

    return first.stats.speed > second.stats.speed ? [firstAction, secondAction] : [secondAction, firstAction];
  }

  private resolveAttack(
    attacker: Combatant,
    defender: Combatant,
    defenderHp: number,
    moveName: string
  ): Omit<BattleTestTurn, "turn"> {
    const move = getMoveDefinition(moveName);
    const attackStat = move.category === "special" ? "specialAttack" : "attack";
    const defenseStat = move.category === "special" ? "specialDefense" : "defense";
    const attack = Math.max(1, attacker.stats[attackStat]);
    const defense = Math.max(1, defender.stats[defenseStat]);
    const effectiveness = calculateEffectiveness(move.type, defender.species.types);
    const critical = Math.random() < (move.highCritical ? 1 / 8 : 1 / 16);
    const criticalMultiplier = critical ? 1.5 : 1;
    const randomMultiplier = randomInt(85, 100) / 100;
    const damage =
      effectiveness === 0
        ? 0
        : Math.max(
            1,
            Math.floor(
              (((((2 * attacker.generated.level) / 5 + 2) * move.power * attack) / defense) / 50 + 2) *
                effectiveness *
                criticalMultiplier *
                randomMultiplier
            )
          );

    return {
      attacker: attacker.generated.speciesName,
      defender: defender.generated.speciesName,
      move: move.name,
      damage,
      defenderRemainingHp: Math.max(0, defenderHp - damage),
      defenderMaxHp: defender.generated.maxHp,
      effectiveness,
      critical
    };
  }

  private buildSnapshot(combatant: Combatant, remainingHp: number): Prisma.InputJsonObject {
    return {
      source: "battletest",
      speciesId: combatant.generated.speciesId,
      species: combatant.generated.speciesName,
      level: combatant.generated.level,
      gender: combatant.generated.gender,
      shiny: combatant.generated.shiny,
      nature: combatant.generated.nature,
      ability: combatant.generated.ability,
      ivs: combatant.generated.ivs,
      evs: combatant.generated.evs,
      moves: combatant.generated.moves,
      currentHp: remainingHp,
      maxHp: combatant.generated.maxHp,
      status: PokemonStatus.NONE,
      stats: combatant.stats,
      summary: this.buildPokemonSummary(combatant)
    } as Prisma.InputJsonObject;
  }

  private toResultPokemon(combatant: Combatant, remainingHp: number): BattleTestPokemon {
    return {
      side: combatant.side,
      label: combatant.label,
      speciesName: combatant.generated.speciesName,
      level: combatant.generated.level,
      ability: combatant.generated.ability,
      nature: combatant.generated.nature,
      moves: combatant.generated.moves,
      maxHp: combatant.generated.maxHp,
      remainingHp,
      spriteUrl: combatant.generated.shiny
        ? combatant.species.shinySpriteUrl ?? combatant.species.spriteUrl
        : combatant.species.spriteUrl,
      summary: this.buildPokemonSummary(combatant)
    };
  }

  private buildPokemonSummary(combatant: Combatant): string {
    const ivLine = STAT_KEYS.map((key) => `${combatant.generated.ivs[key]} ${statName(key)}`).join(" / ");
    const moves = combatant.generated.moves.length > 0 ? combatant.generated.moves : ["Tackle"];

    return [
      `${combatant.generated.speciesName}`,
      `Level: ${combatant.generated.level}`,
      `Ability: ${combatant.generated.ability}`,
      `Moves: ${moves.join(", ")}`,
      `IVs: ${ivLine}`
    ].join("\n");
  }
}

function calculateStats(species: PokemonSpecies, generated: GeneratedWildPokemon): StatTable {
  const baseStats = readStatTable(species.baseStats);

  return STAT_KEYS.reduce((stats, key) => {
    if (key === "hp") {
      stats[key] = generated.maxHp;
      return stats;
    }

    stats[key] = Math.floor(
      ((2 * baseStats[key] + generated.ivs[key] + Math.floor(generated.evs[key] / 4)) * generated.level) / 100 + 5
    );
    return stats;
  }, {} as StatTable);
}

function readStatTable(raw: unknown): StatTable {
  const source = typeof raw === "object" && raw !== null ? (raw as Partial<Record<StatKey, unknown>>) : {};
  return STAT_KEYS.reduce((stats, key) => {
    const value = source[key];
    stats[key] = typeof value === "number" ? value : 1;
    return stats;
  }, {} as StatTable);
}

function pickDamagingMove(moves: string[]): string {
  const damagingMoves = moves.filter((move) => {
    const definition = getMoveDefinition(move);
    return definition.category !== "status" && definition.power > 0;
  });
  const candidates = damagingMoves.length > 0 ? damagingMoves : ["Tackle"];
  return candidates[randomInt(0, candidates.length - 1)] ?? "Tackle";
}

function calculateEffectiveness(moveType: string, defenderTypes: string[]): number {
  const matchups = TYPE_CHART[moveType] ?? {};

  return defenderTypes.reduce((multiplier, defenderType) => multiplier * (matchups[defenderType] ?? 1), 1);
}

function statName(key: StatKey): string {
  switch (key) {
    case "hp":
      return "HP";
    case "attack":
      return "Atk";
    case "defense":
      return "Def";
    case "specialAttack":
      return "SpA";
    case "specialDefense":
      return "SpD";
    case "speed":
      return "Spe";
  }
}
