/**
 * Market headlines from publishers' public RSS feeds: the material the daily
 * recap is written from, and the "Top stories" list. Feeds exist so other sites
 * can show a headline with a link back; we store the title, a short summary,
 * the time and the link, never the article itself.
 *
 * Parsing is deliberately small and dependency-free: RSS 2.0 `<item>` and Atom
 * `<entry>`, CDATA and the common entities. A feed that fails or changes shape
 * yields nothing and the others carry on.
 */

export type Feed = { source: string; url: string }

export const FEEDS: Feed[] = [
  { source: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { source: "CNBC", url: "https://www.cnbc.com/id/15839069/device/rss/rss.html" },
  { source: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { source: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_marketpulse" },
  { source: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
  { source: "Nasdaq", url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets" },
  { source: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
]

export type FeedItem = { source: string; title: string; url: string; summary: string | null; publishedAt: Date }

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

function decode(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
}

/** Text content of a summary, which feeds often send as escaped HTML. */
function plain(text: string) {
  return decode(decode(text))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))
  return match ? match[1]! : null
}

function link(block: string) {
  const text = tag(block, "link")
  if (text && text.trim()) return plain(text)
  // Atom: <link href="..." rel="alternate"/>
  const atom = block.match(/<link\b[^>]*href="([^"]+)"[^>]*\/?>/i)
  return atom ? decode(atom[1]!) : null
}

const MAX_SUMMARY = 400

/** Every usable item in an RSS or Atom document. Items without a title, an http(s) link or a date are dropped. */
export function parseFeed(xml: string, source: string): FeedItem[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) ?? []
  const items: FeedItem[] = []
  for (const block of blocks) {
    const title = plain(tag(block, "title") ?? "").slice(0, 300)
    const url = link(block)?.trim() ?? ""
    const when = tag(block, "pubDate") ?? tag(block, "published") ?? tag(block, "updated") ?? tag(block, "dc:date")
    const publishedAt = when ? new Date(plain(when)) : null
    if (!title || !/^https?:\/\//.test(url) || !publishedAt || Number.isNaN(publishedAt.getTime())) continue
    const raw = tag(block, "description") ?? tag(block, "summary") ?? tag(block, "content")
    const summary = raw ? plain(raw).slice(0, MAX_SUMMARY) || null : null
    items.push({ source, title, url, summary: summary && summary !== title ? summary : null, publishedAt })
  }
  return items
}

/** A link without tracking parameters, so the same story from two feeds is stored once. */
export function canonicalUrl(url: string) {
  try {
    const u = new URL(url)
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|mod$|siteid|cmpid|\.tsrc|ncid)/i.test(key)) u.searchParams.delete(key)
    u.hash = ""
    return u.toString()
  } catch {
    return url
  }
}

/** Fetches every feed in parallel. Each failure is reported, never thrown. */
export async function fetchFeeds(feeds: Feed[] = FEEDS, fetchImpl: typeof fetch = fetch) {
  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const response = await fetchImpl(feed.url, {
          headers: { "user-agent": "Peerfolio/1.0 (+https://www.peerfolio.org)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) return { feed, items: [] as FeedItem[], error: `HTTP ${response.status}` }
        return { feed, items: parseFeed(await response.text(), feed.source), error: null }
      } catch (error) {
        return { feed, items: [] as FeedItem[], error: error instanceof Error ? error.message : "failed" }
      }
    }),
  )
  const seen = new Set<string>()
  const items: FeedItem[] = []
  for (const r of results) {
    for (const item of r.items) {
      const url = canonicalUrl(item.url)
      if (seen.has(url)) continue
      seen.add(url)
      items.push({ ...item, url })
    }
  }
  return { items, failures: results.filter((r) => r.error).map((r) => ({ url: r.feed.url, error: r.error! })) }
}
