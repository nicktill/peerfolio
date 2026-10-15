/** Publisher marks kept in public/sources, by the source name the feeds use. Anything else gets a monogram. */
const LOGOS: Record<string, string> = {
  CNBC: "/sources/cnbc.png",
  MarketWatch: "/sources/marketwatch.png",
}

export const sourceLogo = (source: string): string | null => LOGOS[source] ?? null

/** One or two letters for a publisher without a mark: "Yahoo Finance" is YF, "Nasdaq" is NA. */
export function sourceInitials(source: string): string {
  const words = source.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]).join("") : source.trim().slice(0, 2)).toUpperCase()
}

/** Clock time in New York, fixed so server and browser render the same text. */
export function etTime(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(d)} ET`
}
