/**
 * Retention for `live_quote`, sized for a free-tier database. Policy: every row for the last `rawMs`, then one row
 * per key per `bucketMs` until `coarseMs`, then nothing but the latest row per key, and even that goes once a game
 * is `purgeMs` old. "Key" is (event, market, selection, source).
 */
export type RetentionPolicy = { rawMs: number; bucketMs: number; coarseMs: number; purgeMs: number }

export const DEFAULT_RETENTION: RetentionPolicy = {
  rawMs: 30 * 60_000,
  bucketMs: 5 * 60_000,
  coarseMs: 3 * 24 * 3600_000,
  purgeMs: 30 * 24 * 3600_000,
}

export type RetentionCutoffs = { rawBefore: Date; coarseBefore: Date; purgeBefore: Date; bucketSeconds: number }

export function retentionCutoffs(now: Date, policy: RetentionPolicy = DEFAULT_RETENTION): RetentionCutoffs {
  const t = now.getTime()
  return {
    rawBefore: new Date(t - policy.rawMs),
    coarseBefore: new Date(t - policy.coarseMs),
    purgeBefore: new Date(t - policy.purgeMs),
    bucketSeconds: Math.max(1, Math.round(policy.bucketMs / 1000)),
  }
}

/**
 * Reference implementation of the policy over in-memory rows, used to test the SQL's intent: which row ids survive.
 * Rows are (id, key, fetchedTs).
 */
export function survivors(rows: { id: number; key: string; at: Date }[], now: Date, policy: RetentionPolicy = DEFAULT_RETENTION): Set<number> {
  const c = retentionCutoffs(now, policy)
  const keep = new Set<number>()
  const newest = new Map<string, { id: number; at: number }>()
  const bucketBest = new Map<string, { id: number; at: number }>()
  for (const r of rows) {
    const t = r.at.getTime()
    const n = newest.get(r.key)
    if (!n || t > n.at || (t === n.at && r.id > n.id)) newest.set(r.key, { id: r.id, at: t })
    const b = `${r.key}#${Math.floor(t / 1000 / c.bucketSeconds)}`
    const bb = bucketBest.get(b)
    if (!bb || t > bb.at || (t === bb.at && r.id > bb.id)) bucketBest.set(b, { id: r.id, at: t })
  }
  const latestIds = new Set([...newest.values()].map((v) => v.id))
  const bucketIds = new Set([...bucketBest.values()].map((v) => v.id))
  for (const r of rows) {
    const t = r.at.getTime()
    if (t < c.purgeBefore.getTime()) continue
    if (t >= c.rawBefore.getTime()) keep.add(r.id)
    else if (latestIds.has(r.id)) keep.add(r.id)
    else if (t >= c.coarseBefore.getTime() && bucketIds.has(r.id)) keep.add(r.id)
  }
  return keep
}
