import type { PokemonGender, PokemonStatus } from "@prisma/client";

export const STAT_KEYS = [
  "hp",
  "attack",
  "defense",
  "specialAttack",
  "specialDefense",
  "speed"
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export type StatTable = Record<StatKey, number>;

export type LevelUpMove = {
  level: number;
  move: string;
};

export type EvolutionRule =
  | { to: string; method: "level"; level: number }
  | { to: string; method: "item"; item: string }
  | { to: string; method: "condition"; condition: string };

export type GeneratedWildPokemon = {
  speciesId: string;
  speciesSlug: string;
  speciesName: string;
  level: number;
  gender: PokemonGender;
  shiny: boolean;
  nature: string;
  ability: string;
  ivs: StatTable;
  evs: StatTable;
  moves: string[];
  currentHp: number;
  maxHp: number;
  status: PokemonStatus;
};
