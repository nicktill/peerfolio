/**
 * Which headlines mention something the user holds. A plain, checkable text
 * match, not a judgement: a ticker as a whole word (upper case, so "ALL" in a
 * sentence doesn't match Allstate) or the company's name with its legal suffix
 * removed. The model explains plausible relevance; this only finds candidates.
 */

export type HeldName = { ticker: string | null; name: string | null }
export type Headline = { title: string; summary?: string | null }

const SUFFIX = /\b(inc|incorporated|corp|corporation|co|company|ltd|plc|holdings|group|class [a-c]|common stock|ordinary shares?)\b\.?,?/gi

/** "Apple Inc." -> "apple". Too-short results are dropped: they'd match everywhere. */
export function nameKey(name: string | null): string | null {
  if (!name) return null
  const key = name.replace(SUFFIX, " ").replace(/[^a-z0-9& ]/gi, " ").replace(/\s+/g, " ").trim().toLowerCase()
  return key.length >= 5 ? key : null
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export function matchHoldings(headline: Headline, held: HeldName[]): string[] {
  const text = `${headline.title} ${headline.summary ?? ""}`
  const lower = text.toLowerCase()
  const hits: string[] = []
  for (const h of held) {
    const label = h.ticker ?? h.name
    if (!label || hits.includes(label)) continue
    const byTicker = !!h.ticker && h.ticker.length >= 2 && new RegExp(`(?<![A-Za-z0-9$])\\$?${escape(h.ticker)}(?![A-Za-z0-9])`).test(text)
    const key = nameKey(h.name)
    const byName = !!key && new RegExp(`(?<![a-z0-9])${escape(key)}(?![a-z0-9])`).test(lower)
    if (byTicker || byName) hits.push(label)
  }
  return hits
}
