export interface CooldownStore {
  isBlocked(key: string): Promise<boolean>;
  block(key: string, ttlSeconds: number): Promise<void>;
}

export class InMemoryCooldownStore implements CooldownStore {
  private readonly expiresAtByKey = new Map<string, number>();

  async isBlocked(key: string): Promise<boolean> {
    const expiresAt = this.expiresAtByKey.get(key);
    if (!expiresAt) {
      return false;
    }

    if (Date.now() > expiresAt) {
      this.expiresAtByKey.delete(key);
      return false;
    }

    return true;
  }

  async block(key: string, ttlSeconds: number): Promise<void> {
    this.expiresAtByKey.set(key, Date.now() + ttlSeconds * 1000);
  }
}
