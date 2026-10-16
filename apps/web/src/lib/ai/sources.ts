import { trimUrl } from "./markdown.ts"

/**
 * Where an answer's web addresses came from. A link is only shown as a link when its address was seen in this
 * conversation: in a tool result (news headlines), in a web search citation, or in something the person typed.
 * Anything else is an address the model produced from memory, which is how made-up links happen, so it is
 * drawn as plain text instead. Pure, so the matching rules can be tested.
 */

export type Source = {
  url: string
  title?: string
  /** A web-search citation (shown as a source chip), as opposed to an address that merely appeared in tool data. */
  cited?: boolean
}

const TRACKING = /^(utm_|fbclid$|gclid$|ref$|ref_src$)/i

/** One form for comparing addresses: no scheme difference, no "www.", no fragment, no tracking parameters, no trailing slash. */
export function normalizeUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const params = [...url.searchParams.entries()].filter(([k]) => !TRACKING.test(k))
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : ""
  const path = url.pathname.replace(/\/+$/, "")
  return `${url.hostname.toLowerCase().replace(/^www\./, "")}${path}${query}`
}

/** Every http(s) address in a piece of text, trimmed of trailing punctuation. */
export function collectUrls(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)) {
    const url = trimUrl(m[0])
    if (normalizeUrl(url) && !out.includes(url)) out.push(url)
  }
  return out
}

export function knownSet(sources: Iterable<string>): Set<string> {
  const set = new Set<string>()
  for (const s of sources) {
    const n = normalizeUrl(s)
    if (n) set.add(n)
  }
  return set
}

export const isKnownUrl = (href: string, known: Set<string>) => {
  const n = normalizeUrl(href)
  return n != null && known.has(n)
}

export const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

export const MAX_SOURCES = 20

/** Adds sources, keeping one per address (a citation upgrades a plain mention) and the newest few. */
export function mergeSources(list: Source[] | undefined, next: Source[]): Source[] {
  const out = [...(list ?? [])]
  for (const s of next) {
    const key = normalizeUrl(s.url)
    if (!key) continue
    const at = out.findIndex((o) => normalizeUrl(o.url) === key)
    if (at === -1) out.push(s)
    else out[at] = { ...out[at]!, ...s, cited: out[at]!.cited || s.cited, title: s.title ?? out[at]!.title }
  }
  return out.slice(-MAX_SOURCES)
}

/** Only well-formed sources are ever kept, whatever arrives. */
export function cleanSources(raw: unknown): Source[] {
  if (!Array.isArray(raw)) return []
  const out: Source[] = []
  for (const r of raw.slice(0, MAX_SOURCES)) {
    if (!r || typeof r !== "object") continue
    const { url, title, cited } = r as { url?: unknown; title?: unknown; cited?: unknown }
    if (typeof url !== "string" || url.length > 2000 || !normalizeUrl(url)) continue
    out.push({ url, ...(typeof title === "string" && title ? { title: title.slice(0, 160) } : {}), ...(cited === true ? { cited: true } : {}) })
  }
  return out
}
