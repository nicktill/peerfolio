/**
 * A tiny client-side response cache and in-flight counter.
 *
 * Together they make navigation feel instant: a page you've already visited
 * paints immediately from the last response while a fresh one loads in the
 * background (stale-while-revalidate), and the top progress bar knows when
 * anything is loading. Free of React and the DOM so the tests can run it.
 *
 * Responses are per-user, so the cache must be cleared on sign-out.
 */

type Entry = { data: unknown; at: number }

const MAX_ENTRIES = 60
/** Older than this is treated as absent: better a skeleton than very old numbers. */
export const MAX_STALE_MS = 10 * 60_000

const store = new Map<string, Entry>()

export function cacheGet<T>(key: string, now = Date.now()): { data: T; ageMs: number } | null {
  const entry = store.get(key)
  if (!entry) return null
  const ageMs = now - entry.at
  if (ageMs > MAX_STALE_MS) {
    store.delete(key)
    return null
  }
  return { data: entry.data as T, ageMs }
}

export function cacheSet(key: string, data: unknown, now = Date.now()) {
  // Re-inserting moves the key to the end, so the oldest entry is always first.
  store.delete(key)
  store.set(key, { data, at: now })
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest === undefined) break
    store.delete(oldest)
  }
}

/** Forget everything, or every entry whose key starts with `prefix`. */
export function cacheClear(prefix?: string) {
  if (!prefix) return store.clear()
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key)
}

export function cacheSize() {
  return store.size
}

// ---- in-flight requests, for the progress bar ------------------------------

let inflight = 0
const listeners = new Set<() => void>()

export function beginRequest() {
  inflight++
  listeners.forEach((l) => l())
}

export function endRequest() {
  inflight = Math.max(0, inflight - 1)
  listeners.forEach((l) => l())
}

export const getInflight = () => inflight

/** For `useSyncExternalStore`. */
export function subscribeInflight(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
