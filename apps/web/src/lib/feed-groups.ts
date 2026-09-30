/**
 * Folds a burst of trades by one person into a single feed line, so one
 * enthusiastic afternoon doesn't push everyone else out of view.
 *
 * Plain data in and out, free of imports, so the tests can run it directly.
 */

export type FeedLike = { id: string; name: string | null; handle: string | null; side: "buy" | "sell"; shares: number; price: number; at: string }

export type FeedEntry<T extends FeedLike> =
  | { kind: "single"; item: T }
  | { kind: "group"; key: string; side: "buy" | "sell"; items: T[]; total: number; at: string }

const personOf = (item: FeedLike) => item.handle ?? item.name ?? item.id

/**
 * `items` is newest first. Trades join a group when they're by the same person,
 * on the same side, and within `windowMs` of the trade before them. A buy and a
 * sell never share a line, and a lone trade stays as it is.
 */
export function groupFeed<T extends FeedLike>(items: T[], windowMs = 15 * 60_000): FeedEntry<T>[] {
  const entries: FeedEntry<T>[] = []
  let run: T[] = []

  const flush = () => {
    if (run.length === 0) return
    if (run.length === 1) entries.push({ kind: "single", item: run[0]! })
    else entries.push({ kind: "group", key: run[0]!.id, side: run[0]!.side, items: run, total: run.reduce((sum, t) => sum + t.shares * t.price, 0), at: run[0]!.at })
    run = []
  }

  for (const item of items) {
    const last = run[run.length - 1]
    const joins = last && personOf(last) === personOf(item) && last.side === item.side && Math.abs(Date.parse(last.at) - Date.parse(item.at)) <= windowMs
    if (!joins) flush()
    run.push(item)
  }
  flush()
  return entries
}

/** How many trades sit inside the entries, since a group counts as one line but several trades. */
export const tradeCount = <T extends FeedLike>(entries: FeedEntry<T>[]) => entries.reduce((n, e) => n + (e.kind === "group" ? e.items.length : 1), 0)
