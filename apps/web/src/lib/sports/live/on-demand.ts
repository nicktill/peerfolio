import { liveSlate } from "./plan.ts"
import type { LiveInput } from "./store.ts"
import { buildLiveView, type LiveView, type QuoteRow, type StateRow } from "./view.ts"
import { newWorkerState, runTick, type WorkerDeps } from "./worker.ts"

/**
 * First-load live odds for a viewer. Since #328 the worker follows an in-play game only while someone is watching, so the first
 * viewer after a quiet spell finds no fresh stored quote until the worker wakes (about 30 s, see watch.ts). For that gap the live
 * view route runs ONE worker tick for this one game in memory: the same Polymarket, Kalshi and ESPN reads, matching and
 * normalization as the worker, with nothing written to the database. DISPLAY ONLY: live picks keep reading the worker's stored
 * quotes (live-test.ts), so a pick still needs a confirmed fresh price; this never loosens that guard.
 */

/** The stored view is enough unless the game is not over and its odds are not live. */
export const needsOnDemand = (view: LiveView): boolean => view.status !== "final" && !(view.odds.status === "ok" && view.odds.freshness === "live")

export type Fetchers = Pick<WorkerDeps, "getJson" | "postJson" | "emit">

/** The view with freshly read quotes and state in front of the stored ones, or null when the game is outside its live window or nothing could be read. */
export async function onDemandView(input: LiveInput, now: Date, fetchers: Fetchers): Promise<LiveView | null> {
  const slate = liveSlate([input.event], now)
  if (!slate.length) return null
  const quotes: QuoteRow[] = []
  let state: StateRow | null = null
  const deps: WorkerDeps = {
    store: {
      loadSlate: async () => slate,
      insertQuotes: async (rows) => {
        for (const r of rows) quotes.push({ market: r.market, selection: r.selection, source: r.source, bid: r.bid, ask: r.ask, mid: r.mid, sourceTs: r.sourceTs, fetchedTs: r.fetchedTs })
      },
      upsertState: async (_eventId, s) => {
        state = { status: s.status, homeScore: s.homeScore, awayScore: s.awayScore, period: s.period, clock: s.clock, source: s.source, sourceTs: s.sourceTs, fetchedTs: s.fetchedTs }
      },
    },
    getJson: fetchers.getJson,
    postJson: fetchers.postJson,
    emit: fetchers.emit,
    bookMode: "strict",
  }
  await runTick(deps, newWorkerState(), now)
  if (!quotes.length && !state) return null
  // Fresh rows first: buildLiveView takes the first row of each side per source.
  return buildLiveView({ ...input, quotes: [...quotes, ...input.quotes], state: state ?? input.state }, now)
}
