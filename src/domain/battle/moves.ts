import type { PokemonStatus } from "@prisma/client";

export type MoveCategory = "physical" | "special" | "status";

export type BattleStatStage = "attack" | "defense" | "specialAttack" | "specialDefense" | "speed" | "accuracy";

export type StatStageMoveEffect = {
  target: "self" | "opponent";
  stat: BattleStatStage;
  stages: number;
  chance?: number;
};

export type StatusMoveEffect = {
  target: "self" | "opponent";
  status: Exclude<PokemonStatus, "NONE" | "FAINTED" | "FREEZE">;
  chance?: number;
  minTurns?: number;
  maxTurns?: number;
};

export type MoveEffect = StatStageMoveEffect | StatusMoveEffect;

export type MoveDefinition = {
  name: string;
  type: string;
  category: MoveCategory;
  accuracy: number;
  power: number;
  priority?: number;
  effects?: MoveEffect[];
};

const MOVES: MoveDefinition[] = [
  { name: "Tackle", type: "NORMAL", category: "physical", accuracy: 100, power: 40 },
  { name: "Scratch", type: "NORMAL", category: "physical", accuracy: 100, power: 40 },
  { name: "Quick Attack", type: "NORMAL", category: "physical", accuracy: 100, power: 40, priority: 1 },
  { name: "Vine Whip", type: "GRASS", category: "physical", accuracy: 100, power: 45 },
  { name: "Poison Sting", type: "POISON", category: "physical", accuracy: 100, power: 15, effects: [{ target: "opponent", status: "POISON", chance: 30 }] },
  { name: "Ember", type: "FIRE", category: "special", accuracy: 100, power: 40, effects: [{ target: "opponent", status: "BURN", chance: 10 }] },
  { name: "Water Gun", type: "WATER", category: "special", accuracy: 100, power: 40 },
  { name: "Gust", type: "FLYING", category: "special", accuracy: 100, power: 40 },
  { name: "Thunder Shock", type: "ELECTRIC", category: "special", accuracy: 100, power: 40, effects: [{ target: "opponent", status: "PARALYSIS", chance: 10 }] },
  {
    name: "Growl",
    type: "NORMAL",
    category: "status",
    accuracy: 100,
    power: 0,
    effects: [{ target: "opponent", stat: "attack", stages: -1 }]
  },
  {
    name: "Tail Whip",
    type: "NORMAL",
    category: "status",
    accuracy: 100,
    power: 0,
    effects: [{ target: "opponent", stat: "defense", stages: -1 }]
  },
  {
    name: "Withdraw",
    type: "WATER",
    category: "status",
    accuracy: 100,
    power: 0,
    effects: [{ target: "self", stat: "defense", stages: 1 }]
  },
  {
    name: "Sand Attack",
    type: "GROUND",
    category: "status",
    accuracy: 100,
    power: 0,
    effects: [{ target: "opponent", stat: "accuracy", stages: -1 }]
  },
  {
    name: "Smokescreen",
    type: "NORMAL",
    category: "status",
    accuracy: 100,
    power: 0,
    effects: [{ target: "opponent", stat: "accuracy", stages: -1 }]
  },
  { name: "Leech Seed", type: "GRASS", category: "status", accuracy: 90, power: 0 },
  { name: "Sleep Powder", type: "GRASS", category: "status", accuracy: 75, power: 0, effects: [{ target: "opponent", status: "SLEEP", minTurns: 1, maxTurns: 3 }] },
  { name: "Poison Powder", type: "POISON", category: "status", accuracy: 75, power: 0, effects: [{ target: "opponent", status: "POISON" }] },
  { name: "Stun Spore", type: "GRASS", category: "status", accuracy: 75, power: 0, effects: [{ target: "opponent", status: "PARALYSIS" }] },
  { name: "Thunder Wave", type: "ELECTRIC", category: "status", accuracy: 90, power: 0, effects: [{ target: "opponent", status: "PARALYSIS" }] },
  { name: "Will-O-Wisp", type: "FIRE", category: "status", accuracy: 85, power: 0, effects: [{ target: "opponent", status: "BURN" }] },
  { name: "Hypnosis", type: "PSYCHIC", category: "status", accuracy: 60, power: 0, effects: [{ target: "opponent", status: "SLEEP", minTurns: 1, maxTurns: 3 }] }
];

const MOVE_BY_NORMALIZED_NAME = new Map(MOVES.map((move) => [normalizeMoveName(move.name), move]));

export function getMoveDefinition(name: string): MoveDefinition {
  return (
    MOVE_BY_NORMALIZED_NAME.get(normalizeMoveName(name)) ?? {
      name,
      type: "NORMAL",
      category: "physical",
      accuracy: 100,
      power: 40
    }
  );
}

export function findLearnedMove(learnedMoves: string[], query: string): string | null {
  const normalizedQuery = normalizeMoveName(query);
  return learnedMoves.find((move) => normalizeMoveName(move) === normalizedQuery) ?? null;
}

export function normalizeMoveName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}
