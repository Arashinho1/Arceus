import { BattleState, PokemonStatus, type PokemonSpecies, type PrismaClient } from "@prisma/client";
import { STAT_KEYS, type EvolutionRule, type LevelUpMove, type StatKey, type StatTable } from "../../domain/pokemon/types.js";
import type { BattleRewardSummary, NarrativeBattleData } from "./BattleService.js";

const MIN_XP_REWARD = 20;
const XP_PER_DEFEATED_LEVEL = 28;
const XP_RARITY_WEIGHT = 4;
const MIN_COIN_REWARD = 8;
const COINS_PER_DEFEATED_LEVEL = 5;
const COIN_RARITY_DIVISOR = 24;
const XP_CURVE_BASE = 80;
const XP_CURVE_LINEAR = 45;
const XP_CURVE_QUADRATIC = 12;

export class BattleRewardService {
  constructor(private readonly prisma: PrismaClient) {}

  async apply(data: NarrativeBattleData, state: BattleState): Promise<string[]> {
    if (
      state !== BattleState.FINISHED ||
      data.rewardsApplied ||
      data.testBattle ||
      data.mode === "PVP" ||
      data.winnerSide !== 1
    ) {
      return [];
    }

    const winner = data.activeBySide["1"];
    const defeated = data.activeBySide["2"];
    if (!winner?.pokemonId || !defeated) {
      return [];
    }

    const pokemon = await this.prisma.playerPokemon.findUnique({
      where: { id: winner.pokemonId },
      include: { species: true, user: true }
    });
    const defeatedSpecies = await this.prisma.pokemonSpecies.findUnique({ where: { id: defeated.speciesId } });
    if (!pokemon || !defeatedSpecies) {
      return [];
    }

    const xpGained = calculateXpReward(defeated.level, defeatedSpecies);
    const coinsGained = calculateCoinReward(defeated.level, defeatedSpecies);
    const currentEvs = readStatTable(pokemon.evs);
    const levelResult = applyXpGain(pokemon.level, pokemon.xp, xpGained);
    const evolutionRule = readLevelEvolutions(pokemon.species.evolutions)
      .filter((rule) => rule.level > pokemon.level && rule.level <= levelResult.level)
      .sort((a, b) => a.level - b.level)[0];
    const evolvedSpecies = evolutionRule
      ? await this.prisma.pokemonSpecies.findUnique({ where: { slug: evolutionRule.to } })
      : null;
    const finalSpecies = evolvedSpecies ?? pokemon.species;
    const moveResult = learnMoves(pokemon.moves, finalSpecies.levelUpMoves, pokemon.level, levelResult.level);
    const nextMaxHp = calculateHp(
      readStatTable(finalSpecies.baseStats),
      readStatTable(pokemon.ivs),
      currentEvs,
      levelResult.level
    );
    const hpGain = Math.max(0, nextMaxHp - pokemon.maxHp);
    const nextCurrentHp = Math.min(nextMaxHp, pokemon.currentHp + hpGain);

    await this.prisma.$transaction([
      this.prisma.playerPokemon.update({
        where: { id: pokemon.id },
        data: {
          speciesId: finalSpecies.id,
          xp: levelResult.remainingXp,
          level: levelResult.level,
          moves: moveResult.nextMoves,
          maxHp: nextMaxHp,
          currentHp: nextCurrentHp,
          status: nextCurrentHp > 0 ? PokemonStatus.NONE : PokemonStatus.FAINTED
        }
      }),
      this.prisma.user.update({
        where: { id: pokemon.userId },
        data: { coins: { increment: coinsGained } }
      })
    ]);

    winner.speciesId = finalSpecies.id;
    winner.speciesName = pokemon.nickname ?? finalSpecies.name;
    winner.level = levelResult.level;
    winner.types = finalSpecies.types;
    winner.moves = moveResult.nextMoves;
    winner.currentHp = nextCurrentHp;
    winner.maxHp = nextMaxHp;
    winner.status = nextCurrentHp > 0 ? PokemonStatus.NONE : PokemonStatus.FAINTED;
    winner.stats = calculateStats(finalSpecies, levelResult.level, pokemon.ivs, currentEvs, nextMaxHp);
    winner.spriteUrl = pokemon.shiny ? finalSpecies.shinySpriteUrl ?? finalSpecies.spriteUrl : finalSpecies.spriteUrl;

    const summary: BattleRewardSummary = {
      pokemonId: pokemon.id,
      pokemonName: pokemon.nickname ?? pokemon.species.name,
      defeatedSpeciesName: defeatedSpecies.name,
      xpGained,
      coinsGained,
      levelBefore: pokemon.level,
      levelAfter: levelResult.level,
      movesLearned: moveResult.learnedMoves,
      ...(evolvedSpecies && evolutionRule
        ? { evolution: { from: pokemon.species.name, to: evolvedSpecies.name, level: evolutionRule.level } }
        : {})
    };

    data.rewardsApplied = true;
    data.rewardSummary = summary;
    return formatRewardLines(summary);
  }
}

function calculateStats(
  species: PokemonSpecies,
  level: number,
  rawIvs: unknown,
  rawEvs: unknown,
  knownMaxHp?: number
): StatTable {
  const baseStats = readStatTable(species.baseStats);
  const ivs = readStatTable(rawIvs);
  const evs = readStatTable(rawEvs);

  return STAT_KEYS.reduce((stats, key) => {
    if (key === "hp") {
      stats[key] = knownMaxHp ?? calculateHp(baseStats, ivs, evs, level);
      return stats;
    }

    stats[key] = Math.floor(((2 * baseStats[key] + ivs[key] + Math.floor(evs[key] / 4)) * level) / 100 + 5);
    return stats;
  }, {} as StatTable);
}

function calculateHp(baseStats: StatTable, ivs: StatTable, evs: StatTable, level: number): number {
  return Math.floor(((2 * baseStats.hp + ivs.hp + Math.floor(evs.hp / 4)) * level) / 100) + level + 10;
}

function readStatTable(raw: unknown): StatTable {
  const source = typeof raw === "object" && raw !== null ? (raw as Partial<Record<StatKey, unknown>>) : {};
  return STAT_KEYS.reduce((stats, key) => {
    const value = source[key];
    stats[key] = typeof value === "number" ? value : 0;
    return stats;
  }, {} as StatTable);
}

function calculateXpReward(defeatedLevel: number, defeatedSpecies: PokemonSpecies): number {
  const rarityBonus = Math.max(0, Math.floor((255 - defeatedSpecies.baseCatchRate) / 10));
  return Math.max(MIN_XP_REWARD, defeatedLevel * XP_PER_DEFEATED_LEVEL + rarityBonus * XP_RARITY_WEIGHT);
}

function calculateCoinReward(defeatedLevel: number, defeatedSpecies: PokemonSpecies): number {
  const rarityBonus = Math.max(0, Math.floor((255 - defeatedSpecies.baseCatchRate) / COIN_RARITY_DIVISOR));
  return Math.max(MIN_COIN_REWARD, defeatedLevel * COINS_PER_DEFEATED_LEVEL + rarityBonus);
}

function xpForNextLevel(level: number): number {
  return Math.max(100, Math.floor(XP_CURVE_BASE + level * XP_CURVE_LINEAR + level * level * XP_CURVE_QUADRATIC));
}

function applyXpGain(level: number, xp: number, gainedXp: number): { level: number; remainingXp: number } {
  let nextLevel = level;
  let remainingXp = xp + gainedXp;

  while (nextLevel < 100 && remainingXp >= xpForNextLevel(nextLevel)) {
    remainingXp -= xpForNextLevel(nextLevel);
    nextLevel += 1;
  }

  return { level: nextLevel, remainingXp };
}

function learnMoves(
  currentMoves: string[],
  rawLevelUpMoves: unknown,
  previousLevel: number,
  nextLevel: number
): { nextMoves: string[]; learnedMoves: string[] } {
  if (nextLevel <= previousLevel) {
    return { nextMoves: currentMoves, learnedMoves: [] };
  }

  const learnedMoves = readLevelUpMoves(rawLevelUpMoves)
    .filter((entry) => entry.level > previousLevel && entry.level <= nextLevel)
    .sort((a, b) => a.level - b.level)
    .map((entry) => entry.move)
    .filter((move, index, moves) => moves.indexOf(move) === index && !currentMoves.includes(move));
  if (learnedMoves.length === 0) {
    return { nextMoves: currentMoves, learnedMoves };
  }

  return {
    learnedMoves,
    nextMoves: [...currentMoves, ...learnedMoves].slice(-4)
  };
}

function readLevelUpMoves(raw: unknown): LevelUpMove[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const level = (entry as Record<string, unknown>).level;
    const move = (entry as Record<string, unknown>).move;
    return typeof level === "number" && typeof move === "string" ? [{ level, move }] : [];
  });
}

function readLevelEvolutions(raw: unknown): Extract<EvolutionRule, { method: "level" }>[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const source = entry as Record<string, unknown>;
    return source.method === "level" && typeof source.to === "string" && typeof source.level === "number"
      ? [{ method: "level", to: source.to, level: source.level }]
      : [];
  });
}

function formatRewardLines(summary: BattleRewardSummary): string[] {
  const lines = [
    `Recompensas: ${summary.pokemonName} recebeu ${summary.xpGained} XP e você ganhou ₽ ${summary.coinsGained}.`
  ];

  if (summary.levelAfter > summary.levelBefore) {
    lines.push(`${summary.pokemonName} subiu do nível ${summary.levelBefore} para ${summary.levelAfter}.`);
  }

  if (summary.movesLearned.length > 0) {
    lines.push(`${summary.pokemonName} aprendeu ${summary.movesLearned.join(", ")}.`);
  }

  if (summary.evolution) {
    lines.push(`${summary.evolution.from} evoluiu para ${summary.evolution.to}.`);
  }

  return lines;
}
