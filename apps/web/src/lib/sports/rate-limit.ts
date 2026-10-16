/**
 * Small sliding-window limiter. In memory, so it is per server instance: it
 * slows code guessing, it is not a security boundary on its own (codes are
 * 8 characters from a 29-letter alphabet, and the join error is uniform).
 */
export function createLimiter(max: number, windowMs: number, clock: () => number = Date.now) {
  const hits = new Map<string, number[]>()
  return {
    /** Records an attempt and returns whether it is allowed. */
    take(key: string): boolean {
      const now = clock()
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
      if (recent.length >= max) {
        hits.set(key, recent)
        return false
      }
      recent.push(now)
      hits.set(key, recent)
      if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k)
      return true
    },
  }
}
