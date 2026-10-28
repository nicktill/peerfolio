/** Short-lived first-visit cookie, read once when the account row is created. Values are clipped and carry no query strings or personal data. */
export const SOURCE_COOKIE = "pf_src"
export const SOURCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

export type SignupSource = {
  referrer: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  landingPath: string | null
}

const clip = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max)
  return text || null
}

/** Builds the compact cookie value on the client from the landing URL and document.referrer. */
export function buildSourceCookie(href: string, referrer: string, ownHost: string): string | null {
  let url: URL
  try { url = new URL(href) } catch { return null }
  let host: string | null = null
  try { host = referrer ? new URL(referrer).hostname.replace(/^www\./, "") : null } catch { host = null }
  if (host === ownHost.replace(/^www\./, "")) host = null
  const params = url.searchParams
  const data = { r: host, s: params.get("utm_source"), m: params.get("utm_medium"), c: params.get("utm_campaign"), p: url.pathname }
  return encodeURIComponent(JSON.stringify(data))
}

/** Parses and re-validates the cookie on the server; anything malformed yields null. */
export function parseSourceCookie(raw: string | undefined | null): SignupSource | null {
  if (!raw) return null
  let data: unknown
  try { data = JSON.parse(decodeURIComponent(raw)) } catch { return null }
  if (!data || typeof data !== "object") return null
  const d = data as Record<string, unknown>
  const source = {
    referrer: clip(d.r, 100),
    utmSource: clip(d.s, 60),
    utmMedium: clip(d.m, 60),
    utmCampaign: clip(d.c, 80),
    landingPath: clip(d.p, 120),
  }
  return Object.values(source).some(Boolean) ? source : null
}
