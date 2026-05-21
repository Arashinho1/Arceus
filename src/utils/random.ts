export function randomInt(min: number, max: number): number {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

export function rollChance(chance: number): boolean {
  return Math.random() < Math.max(0, Math.min(1, chance));
}

export function weightedChoice<T>(items: T[], weightOf: (item: T) => number): T | null {
  const total = items.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0);
  if (total <= 0) {
    return null;
  }

  let cursor = Math.random() * total;
  for (const item of items) {
    cursor -= Math.max(0, weightOf(item));
    if (cursor <= 0) {
      return item;
    }
  }

  return items.at(-1) ?? null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
