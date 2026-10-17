import { NextResponse } from "next/server"
import { withSportsUser } from "@web/lib/sports/api"

// Player portraits come from Wikipedia's page image (freely licensed Wikimedia Commons files). Looked up
// once per name and remembered, so the app never leans on Wikipedia for repeat views. A miss is
// remembered too, and the badge falls back to initials.
const cache = new Map<string, { url: string | null; at: number }>()
const DAY = 24 * 3_600_000

const ROLE: Record<string, RegExp> = { tennis: /tennis/i, nfl: /american football|quarterback|running back|wide receiver|tight end|football player/i, nba: /basketball/i }

async function lookup(name: string, sport: string): Promise<string | null> {
  const title = encodeURIComponent(name.trim().replace(/\s+/g, "_"))
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`, {
      headers: { "User-Agent": "Peerfolio/1.0 (player portraits; contact via peerfolio.app)", Accept: "application/json" },
      signal: AbortSignal.timeout(4_000),
    })
    if (!res.ok) return null
    const page = (await res.json()) as { type?: string; description?: string; thumbnail?: { source?: string } }
    // Only accept a page whose description fits the sport: a name can also belong to a town or someone else.
    if (page.type === "disambiguation" || !(ROLE[sport] ?? ROLE.tennis!).test(page.description ?? "")) return null
    const src = page.thumbnail?.source
    if (!src) return null
    const url = new URL(src)
    if (url.hostname !== "upload.wikimedia.org" && url.hostname !== "thumb.wikimedia.org") return null
    url.search = ""
    return url.toString()
  } catch {
    return null
  }
}

export const GET = withSportsUser<unknown>(async (_userId, request) => {
  const name = new URL(request.url).searchParams.get("name")?.trim() ?? ""
  if (name.length < 3 || name.length > 60) return NextResponse.json({ url: null })
  const sport = new URL(request.url).searchParams.get("sport") ?? "tennis"
  if (!(sport in ROLE)) return NextResponse.json({ url: null })
  const key = `${sport}:${name.toLowerCase()}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < DAY) return NextResponse.json({ url: hit.url }, { headers: { "Cache-Control": "private, max-age=86400" } })
  const url = await lookup(name, sport)
  cache.set(key, { url, at: Date.now() })
  return NextResponse.json({ url }, { headers: { "Cache-Control": "private, max-age=86400" } })
})
