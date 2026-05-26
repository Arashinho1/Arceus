import type { PokemonStatus } from "@prisma/client";

export type MoveCategory = "physical" | "special" | "status";

export type BattleStatStage = "attack" | "defense" | "specialAttack" | "specialDefense" | "speed" | "accuracy";
export type MoveTarget = "self" | "opponent";
export type VolatileMoveStatus = "flinch" | "confusion" | "protect" | "seeded";

export type StatStageMoveEffect = {
  target: MoveTarget;
  stat: BattleStatStage;
  stages: number;
  chance?: number;
};

export type StatusMoveEffect = {
  target: MoveTarget;
  status: Exclude<PokemonStatus, "NONE" | "FAINTED" | "FREEZE">;
  chance?: number;
  minTurns?: number;
  maxTurns?: number;
};

export type VolatileMoveEffect = {
  target: MoveTarget;
  volatile: VolatileMoveStatus;
  chance?: number;
  minTurns?: number;
  maxTurns?: number;
};

export type HealMoveEffect = {
  target: "self";
  healPercent: number;
  chance?: number;
};

export type MoveEffect = StatStageMoveEffect | StatusMoveEffect | VolatileMoveEffect | HealMoveEffect;

export type MoveDefinition = {
  name: string;
  type: string;
  category: MoveCategory;
  accuracy: number;
  power: number;
  priority?: number;
  minHits?: number;
  maxHits?: number;
  drainPercent?: number;
  recoilPercent?: number;
  highCritical?: boolean;
  forceSwitch?: boolean;
  effects?: MoveEffect[];
};

const MOVES: MoveDefinition[] = [
  { name: "Pound", type: "NORMAL", category: "physical", accuracy: 100, power: 40 },
  { name: "Tackle", type: "NORMAL", category: "physical", accuracy: 100, power: 40 },
  { name: "Scratch", type: "NORMAL", category: "physical", accuracy: 100, power: 40 },
  { name: "Quick Attack", type: "NORMAL", category: "physical", accuracy: 100, power: 40, priority: 1 },
  { name: "Slam", type: "NORMAL", category: "physical", accuracy: 75, power: 80 },
  { name: "Body Slam", type: "NORMAL", category: "physical", accuracy: 100, power: 85, effects: [{ target: "opponent", status: "PARALYSIS", chance: 30 }] },
  { name: "Take Down", type: "NORMAL", category: "physical", accuracy: 85, power: 90, recoilPercent: 25 },
  { name: "Double Slap", type: "NORMAL", category: "physical", accuracy: 85, power: 15, minHits: 2, maxHits: 5 },
  { name: "Fury Attack", type: "NORMAL", category: "physical", accuracy: 85, power: 15, minHits: 2, maxHits: 5 },
  { name: "Hyper Fang", type: "NORMAL", category: "physical", accuracy: 90, power: 80, effects: [{ target: "opponent", volatile: "flinch", chance: 10 }] },
  { name: "Swords Dance", type: "NORMAL", category: "status", accuracy: 100, power: 0, effects: [{ target: "self", stat: "attack", stages: 2 }] },
  { name: "Agility", type: "PSYCHIC", category: "status", accuracy: 100, power: 0, effects: [{ target: "self", stat: "speed", stages: 2 }] },
  { name: "Recover", type: "NORMAL", category: "status", accuracy: 100, power: 0, effects: [{ target: "self", healPercent: 50 }] },
  { name: "Protect", type: "NORMAL", category: "status", accuracy: 100, power: 0, priority: 4, effects: [{ target: "self", volatile: "protect" }] },
  { name: "Roar", type: "NORMAL", category: "status", accuracy: 100, power: 0, priority: -6, forceSwitch: true },
  { name: "Whirlwind", type: "NORMAL", category: "status", accuracy: 100, power: 0, priority: -6, forceSwitch: true },
  { name: "Vine Whip", type: "GRASS", category: "physical", accuracy: 100, power: 45 },
  { name: "Razor Leaf", type: "GRASS", category: "physical", accuracy: 95, power: 55, highCritical: true },
  { name: "Absorb", type: "GRASS", category: "special", accuracy: 100, power: 20, drainPercent: 50 },
  { name: "Mega Drain", type: "GRASS", category: "special", accuracy: 100, power: 40, drainPercent: 50 },
  { name: "Growth", type: "NORMAL", category: "status", accuracy: 100, power: 0, effects: [{ target: "self", stat: "specialAttack", stages: 1 }] },
  { name: "Poison Sting", type: "POISON", category: "physical", accuracy: 100, power: 15, effects: [{ target: "opponent", status: "POISON", chance: 30 }] },
  { name: "Acid", type: "POISON", category: "special", accuracy: 100, power: 40, effects: [{ target: "opponent", stat: "specialDefense", stages: -1, chance: 10 }] },
  { name: "Sludge", type: "POISON", category: "special", accuracy: 100, power: 65, effects: [{ target: "opponent", status: "POISON", chance: 30 }] },
  { name: "Poison Gas", type: "POISON", category: "status", accuracy: 90, power: 0, effects: [{ target: "opponent", status: "POISON" }] },
  { name: "Ember", type: "FIRE", category: "special", accuracy: 100, power: 40, effects: [{ target: "opponent", status: "BURN", chance: 10 }] },
  { name: "Flame Wheel", type: "FIRE", category: "physical", accuracy: 100, power: 60, effects: [{ target: "opponent", status: "BURN", chance: 10 }] },
  { name: "Fire Fang", type: "FIRE", category: "physical", accuracy: 95, power: 65, effects: [{ target: "opponent", status: "BURN", chance: 10 }, { target: "opponent", volatile: "flinch", chance: 10 }] },
  { name: "Flamethrower", type: "FIRE", category: "special", accuracy: 100, power: 90, effects: [{ target: "opponent", status: "BURN", chance: 10 }] },
  { name: "Water Gun", type: "WATER", category: "special", accuracy: 100, power: 40 },
  { name: "Bubble", type: "WATER", category: "special", accuracy: 100, power: 40, effects: [{ target: "opponent", stat: "speed", stages: -1, chance: 10 }] },
  { name: "Aqua Jet", type: "WATER", category: "physical", accuracy: 100, power: 40, priority: 1 },
  { name: "Bubble Beam", type: "WATER", category: "special", accuracy: 100, power: 65, effects: [{ target: "opponent", stat: "speed", stages: -1, chance: 10 }] },
  { name: "Water Pulse", type: "WATER", category: "special", accuracy: 100, power: 60, effects: [{ target: "opponent", volatile: "confusion", chance: 20, minTurns: 1, maxTurns: 4 }] },
  { name: "Gust", type: "FLYING", category: "special", accuracy: 100, power: 40 },
  { name: "Peck", type: "FLYING", category: "physical", accuracy: 100, power: 35 },
  { name: "Wing Attack", type: "FLYING", category: "physical", accuracy: 100, power: 60 },
  { name: "Air Slash", type: "FLYING", category: "special", accuracy: 95, power: 75, effects: [{ target: "opponent", volatile: "flinch", chance: 30 }] },
  { name: "Roost", type: "FLYING", category: "status", accuracy: 100, power: 0, effects: [{ target: "self", healPercent: 50 }] },
  { name: "Thunder Shock", type: "ELECTRIC", category: "special", accuracy: 100, power: 40, effects: [{ target: "opponent", status: "PARALYSIS", chance: 10 }] },
  { name: "Spark", type: "ELECTRIC", category: "physical", accuracy: 100, power: 65, effects: [{ target: "opponent", status: "PARALYSIS", chance: 30 }] },
  { name: "Thunderbolt", type: "ELECTRIC", category: "special", accuracy: 100, power: 90, effects: [{ target: "opponent", status: "PARALYSIS", chance: 10 }] },
  { name: "Mud Slap", type: "GROUND", category: "special", accuracy: 100, power: 20, effects: [{ target: "opponent", stat: "accuracy", stages: -1 }] },
  { name: "Rock Throw", type: "ROCK", category: "physical", accuracy: 90, power: 50 },
  { name: "Rock Tomb", type: "ROCK", category: "physical", accuracy: 95, power: 60, effects: [{ target: "opponent", stat: "speed", stages: -1 }] },
  { name: "Low Kick", type: "FIGHTING", category: "physical", accuracy: 100, power: 60 },
  { name: "Karate Chop", type: "FIGHTING", category: "physical", accuracy: 100, power: 50, highCritical: true },
  { name: "Bulk Up", type: "FIGHTING", category: "status", accuracy: 100, power: 0, effects: [{ target: "self", stat: "attack", stages: 1 }, { target: "self", stat: "defense", stages: 1 }] },
  { name: "Confusion", type: "PSYCHIC", category: "special", accuracy: 100, power: 50, effects: [{ target: "opponent", volatile: "confusion", chance: 10, minTurns: 1, maxTurns: 4 }] },
  { name: "Psybeam", type: "PSYCHIC", category: "special", accuracy: 100, power: 65, effects: [{ target: "opponent", volatile: "confusion", chance: 10, minTurns: 1, maxTurns: 4 }] },
  { name: "Bite", type: "DARK", category: "physical", accuracy: 100, power: 60, effects: [{ target: "opponent", volatile: "flinch", chance: 30 }] },
  { name: "Crunch", type: "DARK", category: "physical", accuracy: 100, power: 80, effects: [{ target: "opponent", stat: "defense", stages: -1, chance: 20 }] },
  { name: "Lick", type: "GHOST", category: "physical", accuracy: 100, power: 30, effects: [{ target: "opponent", status: "PARALYSIS", chance: 30 }] },
  { name: "Ice Shard", type: "ICE", category: "physical", accuracy: 100, power: 40, priority: 1 },
  { name: "Ice Beam", type: "ICE", category: "special", accuracy: 100, power: 90 },
  { name: "Dragon Breath", type: "DRAGON", category: "special", accuracy: 100, power: 60, effects: [{ target: "opponent", status: "PARALYSIS", chance: 30 }] },
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
  { name: "Leech Seed", type: "GRASS", category: "status", accuracy: 90, power: 0, effects: [{ target: "opponent", volatile: "seeded" }] },
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
