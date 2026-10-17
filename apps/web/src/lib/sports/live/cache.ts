/**
 * Tiny per-instance TTL cache with in-flight sharing, so a burst of viewers of one game costs one database read per
 * TTL per server instance. (The CDN `s-maxage` on the response absorbs most of the rest.)
 */
export function createTtlCache<V>(ttlMs: number, maxEntries = 500) {
  const done = new Map<string, { at: number; value: V }>()
  const inflight = new Map<string, Promise<V>>()
  return {
    async get(key: string, now: number, load: () => Promise<V>): Promise<V> {
      const hit = done.get(key)
      if (hit && now - hit.at < ttlMs) return hit.value
      const running = inflight.get(key)
      if (running) return running
      const p = load()
        .then((value) => {
          if (done.size >= maxEntries) done.delete(done.keys().next().value as string)
          done.set(key, { at: now, value })
          return value
        })
        .finally(() => inflight.delete(key))
      inflight.set(key, p)
      return p
    },
  }
}
