import { canSpend, type CreditPlan, type UsageStore } from "../credit-budget.ts"
import type { OddsProvider, OddsSnapshot, ProviderEvent, ProviderMarket, Sport } from "../types.ts"

/**
 * Several odds sources behind one {@link OddsProvider}, in the spirit of
 * lib/composite-provider.ts for stock quotes: ask the first source, and ask the
 * next ones only for what is still thin or missing. Differences from quotes:
 *
 *  - sources are metered by monthly credits, so each is gated by a
 *    {@link CreditPlan} and skipped (not failed) when its pace is used up;
 *  - answers are MERGED rather than first-wins: a second source's books are
 *    added to the same market, so two free tiers give the consensus more
 *    books (more accurate, harder to game) instead of only filling gaps;
 *  - a source that throws costs nothing but its own contribution.
 */

export type Source = {
  provider: OddsProvider
  plan: CreditPlan
  /** Credits one fetch for this sport will cost this source. */
  cost: (sport: Sport) => number
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
const SAME_GAME_WINDOW_MS = 20 * 60_000

/** Same game across vendors: kickoff within 20 minutes and the same two names (either orientation). */
export function sameEvent(a: ProviderEvent, b: ProviderEvent): boolean {
  if (a.sport !== b.sport) return false
  if (Math.abs(a.startsAt.getTime() - b.startsAt.getTime()) > SAME_GAME_WINDOW_MS) return false
  const [ah, aa, bh, ba] = [norm(a.homeName), norm(a.awayName), norm(b.homeName), norm(b.awayName)]
  return (ah === bh && aa === ba) || (ah === ba && aa === bh)
}

const flipped = (a: ProviderEvent, b: ProviderEvent) => norm(a.homeName) !== norm(b.homeName)

/** Re-orient a market from `b`'s home/away to `a`'s when the vendors list the teams the other way round. */
function orient(market: ProviderMarket): ProviderMarket {
  if (market.kind !== "moneyline" && market.kind !== "spread") return market
  const swap = { home: "away", away: "home" } as const
  return { ...market, outcomes: market.outcomes.map((o) => ({ ...o, selection: o.selection === "home" || o.selection === "away" ? swap[o.selection] : o.selection })) }
}

/** Merge `extra` into `base`: union of books per selection, de-duplicated by book id. */
export function mergeSnapshots(base: ProviderEvent[], extra: ProviderEvent[]): ProviderEvent[] {
  const out = base.map((e) => ({ ...e, markets: e.markets.map((m) => ({ ...m, outcomes: m.outcomes.map((o) => ({ ...o, quotes: [...o.quotes] })) })) }))
  for (const e of extra) {
    const target = out.find((x) => sameEvent(x, e))
    if (!target) {
      out.push(e)
      continue
    }
    const swap = flipped(target, e)
    for (const raw of e.markets) {
      const m = swap ? orient(raw) : raw
      const mine = target.markets.find((x) => x.key === m.key && (x.player ?? "") === (m.player ?? ""))
      if (!mine) {
        target.markets.push(m)
        continue
      }
      for (const o of m.outcomes) {
        const slot = mine.outcomes.find((x) => x.selection === o.selection)
        if (!slot) {
          mine.outcomes.push({ ...o, quotes: [...o.quotes] })
          continue
        }
        const seen = new Set(slot.quotes.map((q) => `${q.book}|${q.point}`))
        for (const q of o.quotes) if (!seen.has(`${q.book}|${q.point}`)) slot.quotes.push(q)
      }
    }
  }
  return out
}

/** True while some market lacks `minBooks` books on either side, or nothing came back at all. */
export function isThin(events: ProviderEvent[], minBooks: number): boolean {
  if (events.length === 0) return true
  return events.some((e) => e.markets.some((m) => m.outcomes.length < 2 || m.outcomes.some((o) => o.quotes.length < minBooks)))
}

export function createCompositeOdds(sources: Source[], usage: UsageStore, opts: { minBooks: number } = { minBooks: 3 }): OddsProvider {
  return {
    name: sources.map((s) => s.provider.name).join("+"),

    async fetchOdds(sport: Sport, now: Date): Promise<OddsSnapshot> {
      let events: ProviderEvent[] = []
      const notes: string[] = []
      const fetched: Date[] = []

      for (const source of sources) {
        const name = source.provider.name
        if (events.length > 0 && !isThin(events, opts.minBooks)) {
          notes.push(`${name}: not needed`)
          continue
        }
        const cost = source.cost(sport)
        const used = await usage.usage(name, now)
        if (!canSpend(source.plan, used, cost, now)) {
          notes.push(`${name}: skipped, credit pace used up (${used.day} today, ${used.month} this month)`)
          continue
        }
        try {
          const snap = await source.provider.fetchOdds(sport, now)
          // Charge even when the answer is empty: the provider billed us.
          await usage.record(name, cost, now)
          events = mergeSnapshots(events, snap.events)
          // The merged snapshot is only as fresh as its oldest contributor.
          fetched.push(snap.fetchedAt)
          notes.push(`${name}: ${snap.events.length} events, ${cost} credits`)
        } catch (error) {
          notes.push(`${name}: failed (${error instanceof Error ? error.message : "error"})`)
        }
      }
      const complete = !notes.some((n) => n.includes(": failed") || n.includes(": skipped"))
      return { complete, provider: sources.map((s) => s.provider.name).join("+"), fetchedAt: fetched.length ? new Date(Math.min(...fetched.map((d) => d.getTime()))) : new Date(0), events, notes }
    },
  }
}

/**
 * Serve repeat calls from memory for `ttlMs`, and fall back to the last good
 * snapshot if the wrapped source fails. One server instance asks the vendors
 * once per TTL no matter how many callers. (Users never call providers at
 * all: they read published lines from the database; this guards cron overlap
 * and local dev.)
 */
export function withSnapshotCache(inner: OddsProvider, ttlMs: number, clock: () => number = Date.now): OddsProvider {
  const cache = new Map<Sport, { at: number; snap: OddsSnapshot }>()
  return {
    name: inner.name,
    async fetchOdds(sport, now) {
      const hit = cache.get(sport)
      if (hit && clock() - hit.at < ttlMs) return hit.snap
      const snap = await inner.fetchOdds(sport, now)
      // An all-sources-down answer is not cached over a good one; the staleness check in planPublication still applies.
      if (snap.events.length === 0 && hit) return hit.snap
      cache.set(sport, { at: clock(), snap })
      return snap
    },
  }
}
