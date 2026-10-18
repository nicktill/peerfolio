/** A small bounded cache of "this key was confirmed at time t", expiring after `ttlMs`. Oldest entries go first. */
export function createTtlSet(options: { ttlMs: number; maxEntries: number; now?: () => number }) {
  const now = options.now ?? Date.now
  const entries = new Map<string, number>()
  return {
    has(key: string): boolean {
      const at = entries.get(key)
      if (at === undefined) return false
      if (now() - at >= options.ttlMs) {
        entries.delete(key)
        return false
      }
      return true
    },
    add(key: string) {
      entries.delete(key)
      entries.set(key, now())
      while (entries.size > options.maxEntries) entries.delete(entries.keys().next().value as string)
    },
    delete(key: string) {
      entries.delete(key)
    },
    get size() {
      return entries.size
    },
  }
}
