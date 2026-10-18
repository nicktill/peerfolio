/**
 * Same-origin check for state-changing API requests (defense in depth beside SameSite cookies).
 *
 * Browsers attach `Origin` to every cross-origin write and to most same-origin ones. When it is present it must be one of
 * this deployment's own origins: the request URL's, the one the proxy forwarded (Vercel), or the configured public site
 * (`NEXTAUTH_URL`). `www` and the apex are different origins and are not treated as interchangeable; the app is served on
 * whichever host the browser loaded it from and calls its API with relative URLs, so they always agree.
 * When `Origin` is absent (older clients, some same-origin form posts, non-browser callers) the request is allowed unless
 * the browser says via `Sec-Fetch-Site` that it came from another site.
 */

export type OriginCheckInput = {
  method: string
  url: string
  origin: string | null
  secFetchSite: string | null
  host?: string | null
  forwardedHost?: string | null
  forwardedProto?: string | null
  /** The configured public URL (NEXTAUTH_URL), if any. */
  siteUrl?: string | null
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

const originOf = (value: string | null | undefined): string | null => {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function allowedOrigins(input: Pick<OriginCheckInput, "url" | "host" | "forwardedHost" | "forwardedProto" | "siteUrl">): Set<string> {
  const allowed = new Set<string>()
  const own = originOf(input.url)
  if (own) allowed.add(own)
  const site = originOf(input.siteUrl)
  if (site) allowed.add(site)
  const proto = input.forwardedProto?.split(",")[0]?.trim() || (own ? new URL(own).protocol.replace(":", "") : "https")
  const forwarded = input.forwardedHost?.split(",")[0]?.trim()
  for (const host of [forwarded, input.host?.trim()]) {
    if (!host) continue
    const origin = originOf(`${proto}://${host}`)
    if (origin) allowed.add(origin)
  }
  return allowed
}

export function isSameOriginRequest(input: OriginCheckInput): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true
  if (input.origin !== null && input.origin !== "") return allowedOrigins(input).has(input.origin)
  return input.secFetchSite?.toLowerCase() !== "cross-site"
}

export function requestIsSameOrigin(request: Request): boolean {
  return isSameOriginRequest({
    method: request.method,
    url: request.url,
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    siteUrl: process.env.NEXTAUTH_URL,
  })
}
