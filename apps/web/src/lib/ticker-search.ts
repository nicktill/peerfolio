/**
 * Ranking for the ticker autocomplete: what someone typed against symbols and
 * company names from wherever we have them (our own securities table, the
 * provider's search). Plain data and no imports, so the tests can run it.
 */

export type TickerSuggestion = { symbol: string; name: string | null }

/** Letters, digits and the separators tickers and names use; anything else is dropped. */
export function normalizeQuery(raw: string): string {
  return raw.replace(/[^A-Za-z0-9.\-/ &']/g, "").trim().slice(0, 40)
}

/** "Applied Digital Corporation Common Stock" reads better as "Applied Digital Corporation". */
export function cleanName(name: string | null | undefined): string | null {
  if (!name) return null
  const cleaned = name
    .replace(/\s+(Class [A-Z] )?(Common Stock|Ordinary Shares|Common Shares|Capital Stock)(\s.*)?$/i, "")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned || name.trim()
}

/**
 * Lower is better; null means no match. Symbol matches beat name matches, and
 * a name match at the start of a word beats one in the middle of it.
 */
export function matchScore(query: string, s: TickerSuggestion): number | null {
  const q = query.trim().toUpperCase()
  if (!q) return null
  const symbol = s.symbol.toUpperCase()
  const name = (s.name ?? "").toUpperCase()
  if (symbol === q) return 0
  if (symbol.startsWith(q)) return 1
  if (name.startsWith(q)) return 2
  if (name.split(/[\s.,&\-/]+/).some((word) => word.startsWith(q))) return 3
  if (q.length >= 3 && name.includes(q)) return 4
  return null
}

/**
 * Merges sources in priority order (earlier wins on a duplicate symbol, but a
 * later source can fill in a missing name), drops non-matches, and ranks.
 */
export function rankSuggestions(query: string, sources: TickerSuggestion[][], limit = 6): TickerSuggestion[] {
  const merged = new Map<string, TickerSuggestion>()
  for (const source of sources) {
    for (const s of source) {
      const symbol = s.symbol.trim().toUpperCase()
      if (!symbol) continue
      const existing = merged.get(symbol)
      if (!existing) merged.set(symbol, { symbol, name: cleanName(s.name) })
      else if (!existing.name && s.name) existing.name = cleanName(s.name)
    }
  }
  return [...merged.values()]
    .map((s) => ({ s, score: matchScore(query, s) }))
    .filter((r): r is { s: TickerSuggestion; score: number } => r.score !== null)
    .sort((a, b) => a.score - b.score || a.s.symbol.length - b.s.symbol.length || a.s.symbol.localeCompare(b.s.symbol))
    .slice(0, limit)
    .map((r) => r.s)
}
