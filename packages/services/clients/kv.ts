/** The subset of Redis the HTTP wrapper needs: response cache, stale copies and status hashes (SPEC 5.3). */
export interface KvStore {
  get(key: string): Promise<string | null>;
  setEx(key: string, ttlSeconds: number, value: string): Promise<void>;
  hset(key: string, fields: Record<string, string>): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
}

/** In-memory store for tests and scripts without Redis. `now` drives expiry. */
export class MemoryKvStore implements KvStore {
  private readonly values = new Map<string, { value: string; expiresAt: number }>();
  private readonly hashes = new Map<string, Record<string, string>>();

  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string): Promise<string | null> {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    this.values.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async hset(key: string, fields: Record<string, string>): Promise<void> {
    this.hashes.set(key, { ...(this.hashes.get(key) ?? {}), ...fields });
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return { ...(this.hashes.get(key) ?? {}) };
  }
}
