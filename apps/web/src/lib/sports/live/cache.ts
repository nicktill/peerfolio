/**
 * Small per-instance helpers for the public live endpoint: a TTL cache with in-flight sharing (a burst of viewers of one
 * game costs one database read per TTL per server instance, and unknown ids are negative-cached longer) and an
 * in-memory fixed-window rate limiter. In memory on purpose: the endpoint is unauthenticated and polled, so neither
 * may touch the database (the DB-backed `takeRateLimit` is per signed-in user and would keep a serverless Postgres awake).
 */
export function createTtlCache<V>(ttlMs: number, maxEntries = 500) {
  const done = new Map<string, { at: number; ttl: number; value: V }>()
  const inflight = new Map<string, Promise<V>>()
  return {
    /** `ttlFor` lets a value choose its own lifetime (e.g. null = unknown game, cached longer). */
    async getMeta(key: string, now: number, load: () => Promise<V>, ttlFor?: (v: V) => number): Promise<{ value: V; hit: boolean; ageMs: number }> {
      const hit = done.get(key)
      if (hit && now - hit.at < hit.ttl) return { value: hit.value, hit: true, ageMs: now - hit.at }
      const running = inflight.get(key)
      if (running) return { value: await running, hit: true, ageMs: 0 }
      const p = load()
        .then((value) => {
          if (done.size >= maxEntries) done.delete(done.keys().next().value as string)
          done.set(key, { at: now, ttl: ttlFor ? ttlFor(value) : ttlMs, value })
          return value
        })
        .finally(() => inflight.delete(key))
      inflight.set(key, p)
      return { value: await p, hit: false, ageMs: 0 }
    },
    async get(key: string, now: number, load: () => Promise<V>): Promise<V> {
      return (await this.getMeta(key, now, load)).value
    },
  }
}

/** Fixed-window counter per key (an IP). Old windows are dropped lazily, bounded by `maxKeys`. */
export function createMemoryLimiter(max: number, windowMs: number, maxKeys = 5000) {
  const hits = new Map<string, { window: number; n: number }>()
  return {
    /** True if this request is allowed. */
    take(key: string, now: number): boolean {
      const window = Math.floor(now / windowMs)
      const cur = hits.get(key)
      if (!cur || cur.window !== window) {
        if (hits.size >= maxKeys) for (const [k, v] of hits) if (v.window !== window) hits.delete(k)
        if (hits.size >= maxKeys) return false
        hits.set(key, { window, n: 1 })
        return true
      }
      cur.n++
      return cur.n <= max
    },
  }
}

/** The client address as the platform reports it (first hop of x-forwarded-for), or "unknown". */
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = headers.get("x-forwarded-for")
  return (xff?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown").slice(0, 64)
}
