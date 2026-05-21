import { PokemonGender, PokemonStatus, type PokemonSpecies } from "@prisma/client";
import type { GeneratedWildPokemon, LevelUpMove, StatTable } from "../../domain/pokemon/types.js";
import { STAT_KEYS } from "../../domain/pokemon/types.js";
import { randomInt, rollChance } from "../../utils/random.js";

const NATURES = [
  "Hardy",
  "Lonely",
  "Brave",
  "Adamant",
  "Naughty",
  "Bold",
  "Docile",
  "Relaxed",
  "Impish",
  "Lax",
  "Timid",
  "Hasty",
  "Serious",
  "Jolly",
  "Naive",
  "Modest",
  "Mild",
  "Quiet",
  "Bashful",
  "Rash",
  "Calm",
  "Gentle",
  "Sassy",
  "Careful",
  "Quirky"
] as const;

export type GenerateWildPokemonInput = {
  minLevel: number;
  maxLevel: number;
  shinyChance: number;
};

export class PokemonGeneratorService {
  generateWildPokemon(
    species: PokemonSpecies,
    input: GenerateWildPokemonInput
  ): GeneratedWildPokemon {
    const level = randomInt(input.minLevel, input.maxLevel);
    const ivs = this.generateStatTable(0, 31);
    const evs = this.generateStatTable(0, 0);
    const baseStats = this.readBaseStats(species.baseStats);
    const maxHp = this.calculateHp(baseStats, ivs, evs, level);

    return {
      speciesId: species.id,
      speciesSlug: species.slug,
      speciesName: species.name,
      level,
      gender: this.pickGender(species.genderRatioFemale),
      shiny: rollChance(input.shinyChance),
      nature: this.pickNature(),
      ability: this.pickAbility(species),
      ivs,
      evs,
      moves: this.pickMoves(species.levelUpMoves, level),
      currentHp: maxHp,
      maxHp,
      status: PokemonStatus.NONE
    };
  }

  private generateStatTable(min: number, max: number): StatTable {
    return STAT_KEYS.reduce((stats, key) => {
      stats[key] = randomInt(min, max);
      return stats;
    }, {} as StatTable);
  }

  private readBaseStats(raw: unknown): StatTable {
    const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    return STAT_KEYS.reduce((stats, key) => {
      const value = source[key];
      stats[key] = typeof value === "number" ? value : 1;
      return stats;
    }, {} as StatTable);
  }

  private calculateHp(baseStats: StatTable, ivs: StatTable, evs: StatTable, level: number): number {
    return Math.floor(((2 * baseStats.hp + ivs.hp + Math.floor(evs.hp / 4)) * level) / 100) + level + 10;
  }

  private pickGender(genderRatioFemale: number | null): PokemonGender {
    if (genderRatioFemale === null) {
      return PokemonGender.GENDERLESS;
    }

    return Math.random() < genderRatioFemale ? PokemonGender.FEMALE : PokemonGender.MALE;
  }

  private pickNature(): string {
    return NATURES[randomInt(0, NATURES.length - 1)] ?? "Hardy";
  }

  private pickAbility(species: PokemonSpecies): string {
    if (species.abilities.length === 0) {
      return species.hiddenAbility ?? "Unknown";
    }

    return species.abilities[randomInt(0, species.abilities.length - 1)] ?? species.abilities[0] ?? "Unknown";
  }

  private pickMoves(rawLevelUpMoves: unknown, level: number): string[] {
    const moves = this.readLevelUpMoves(rawLevelUpMoves)
      .filter((entry) => entry.level <= level)
      .sort((a, b) => a.level - b.level)
      .slice(-4)
      .map((entry) => entry.move);

    return moves.length > 0 ? moves : ["Tackle"];
  }

  private readLevelUpMoves(raw: unknown): LevelUpMove[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return [];
      }

      const level = (entry as Record<string, unknown>).level;
      const move = (entry as Record<string, unknown>).move;

      if (typeof level !== "number" || typeof move !== "string") {
        return [];
      }

      return [{ level, move }];
    });
  }
}
