import { isRange, type Range } from "../ranges.ts"
import { isBenchmarkSymbol } from "../benchmarks.ts"

/**
 * Argument handling for the assistant's tools. The model's arguments are untrusted
 * text: every helper here tolerates garbage and falls back to a safe default, and
 * none of them ever yields a user id.
 */

/** Most leagues summarised in one answer, to bound the work and the size of what the model reads. */
export const MAX_LEAGUE_OVERVIEW = 5

/** The arguments as an object; anything that isn't a JSON object becomes empty. */
export function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function parseLimit(args: Record<string, unknown>, fallback = 10): number {
  const v = args.limit
  return typeof v === "number" && Number.isFinite(v) ? Math.min(25, Math.max(1, Math.trunc(v))) : fallback
}

export function parseRange(args: Record<string, unknown>): Range {
  return typeof args.range === "string" && isRange(args.range) ? args.range : "1M"
}

/** The benchmark symbol, upper-cased, or null when it isn't one we offer. */
export function parseBenchmark(args: Record<string, unknown>): string | null {
  const symbol = typeof args.symbol === "string" ? args.symbol.toUpperCase() : ""
  return isBenchmarkSymbol(symbol) ? symbol : null
}

/** The league the model named, else the one open on the page. Either is only a hint until membership is checked. */
export function requestedLeagueId(args: Record<string, unknown>, pageId: string | undefined): string | undefined {
  return typeof args.leagueId === "string" && args.leagueId ? args.leagueId : pageId
}

export type LeagueLookup =
  | { kind: "none" }
  | { kind: "overview"; ids: string[]; truncated: boolean }
  | { kind: "single"; id: string }

/** With no league named or open: none, one (use it), or several (a capped overview). */
export function planLeagueLookup(mine: { id: string }[]): LeagueLookup {
  if (mine.length === 0) return { kind: "none" }
  if (mine.length === 1) return { kind: "single", id: mine[0]!.id }
  return { kind: "overview", ids: mine.slice(0, MAX_LEAGUE_OVERVIEW).map((l) => l.id), truncated: mine.length > MAX_LEAGUE_OVERVIEW }
}

/** Runs the membership check first and reads data only if it passes; a failed check means the read never starts. */
export async function readAfterMembership<T>(check: () => Promise<unknown>, read: () => Promise<T>): Promise<T> {
  await check()
  return read()
}
