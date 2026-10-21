/** Session-scoped cache. It never persists customer data or logs document contents. */
export class QueryCache {
  private entries = new Map<string, { value?: unknown; expires: number; pending?: Promise<unknown>; version: number }>();
  private generation = 0;
  readonly metrics = { requests: 0, hits: 0, shared: 0, failures: 0 };

  peek<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    return entry && entry.expires > Date.now() ? entry.value as T : undefined;
  }

  async read<T>(key: string, load: () => Promise<T>, ttl = 120_000): Promise<T> {
    let entry = this.entries.get(key);
    if (entry?.pending) { this.metrics.shared++; return entry.pending as Promise<T>; }
    if (entry && entry.expires > Date.now() && "value" in entry) { this.metrics.hits++; return entry.value as T; }
    // Bound memory in long-running sessions with many filter/cursor combinations.
    if (this.entries.size >= 300) {
      for (const [oldKey, old] of this.entries) {
        if (!old.pending) { this.entries.delete(oldKey); if (this.entries.size < 250) break; }
      }
    }
    entry = { expires: 0, version: this.generation };
    this.entries.set(key, entry);
    this.metrics.requests++;
    const current = entry;
    const promise = Promise.resolve().then(load).then(value => {
      if (this.entries.get(key) === current && current.version === this.generation) {
        current.value = value;
        current.expires = Date.now() + ttl;
        current.pending = undefined;
      }
      return value;
    }, error => {
      this.metrics.failures++;
      if (this.entries.get(key) === current) this.entries.delete(key);
      throw error;
    });
    current.pending = promise;
    return promise;
  }

  invalidate(prefix: string) {
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }

  clear() { this.generation++; this.entries.clear(); }
}

export const crmQueryCache = new QueryCache();

const observers = new Set<(resource: string) => void>();
export function onResourceInvalidated(listener: (resource: string) => void) {
  observers.add(listener);
  return () => { observers.delete(listener); };
}
export function invalidateResource(resource: string) {
  crmQueryCache.invalidate(`${resource}:`);
  for (const listener of observers) listener(resource);
}
