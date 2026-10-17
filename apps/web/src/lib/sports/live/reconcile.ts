import { minConfidence } from "./quote.ts"
import { SOURCE_PRIORITY, type Confidence, type LiveOdds, type SourceProb } from "./types.ts"

/** Two sources more than this far apart in P(home): show the primary but downgrade it to low confidence and flag it. */
export const MISMATCH_WARN = 0.08
/** Two ORDER-BOOK sources this far apart: neither is trusted, odds are paused. A model (ESPN) can only warn. */
export const MISMATCH_HIDE = 0.2

const isBook = (s: SourceProb) => s.source !== "espn"

/**
 * Chooses what to show from every source's current view of P(home wins) (and, for soccer, P(draw)).
 *
 *  1. Drop stale and confidence-"none" views (they cannot be shown).
 *  2. The primary is the highest-priority survivor (Polymarket, then Kalshi, then ESPN), so a dead primary falls
 *     back automatically.
 *  3. Cross-check the primary against each other survivor. Past the warn gap the primary is kept but marked low
 *     confidence with a mismatch note; two order books past the hide gap pause the odds ("sources disagree").
 *  4. Nothing survives: paused, "stale" if something existed but was too old, else "no_quote".
 *
 * Pure. `gameOver` hides odds once the game is final.
 */
export function chooseLiveOdds(views: SourceProb[], opts: { gameOver?: boolean; threeWay?: boolean } = {}): LiveOdds {
  // Three-way (soccer): only a view that has a draw probability can be shown. A single "home wins" number from a model says nothing
  // about the draw, so it is never turned into an away probability.
  if (opts.threeWay) views = views.filter((v) => v.drawProb != null)
  const lastAsOf = views.length ? new Date(Math.max(...views.map((v) => v.asOf.getTime()))) : null
  if (opts.gameOver) return { status: "paused", reason: "game_over", lastAsOf }

  const usable = views
    .filter((v) => v.freshness !== "stale" && v.confidence !== "none" && v.homeProb > 0 && v.homeProb < 1 && (v.drawProb == null || (v.drawProb > 0 && v.homeProb + v.drawProb < 1)))
    .sort((a, b) => SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source))
  if (usable.length === 0) {
    const anyUnusableBook = views.some((v) => v.freshness !== "stale" && v.confidence === "none")
    return { status: "paused", reason: views.length === 0 ? "no_quote" : anyUnusableBook ? "wide_spread" : "stale", lastAsOf }
  }

  const primary = usable[0]!
  let mismatch: { with: SourceProb["source"]; diff: number } | null = null
  for (const other of usable.slice(1)) {
    const diff = Math.max(Math.abs(primary.homeProb - other.homeProb), primary.drawProb != null && other.drawProb != null ? Math.abs(primary.drawProb - other.drawProb) : 0)
    if (diff > MISMATCH_HIDE && isBook(primary) && isBook(other)) return { status: "paused", reason: "sources_disagree", lastAsOf }
    if (diff > MISMATCH_WARN && (!mismatch || diff > mismatch.diff)) mismatch = { with: other.source, diff }
  }

  const confidence: Exclude<Confidence, "none"> = (mismatch ? minConfidence(primary.confidence, "low") : primary.confidence) as Exclude<Confidence, "none">
  return {
    status: "ok",
    homeProb: primary.homeProb,
    awayProb: 1 - primary.homeProb - (primary.drawProb ?? 0),
    drawProb: primary.drawProb ?? null,
    source: primary.source,
    asOf: primary.asOf,
    ageMs: primary.ageMs,
    freshness: primary.freshness as "live" | "delayed",
    confidence,
    mismatch,
  }
}
