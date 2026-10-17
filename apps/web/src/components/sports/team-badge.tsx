"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { onColor, teamLook } from "@web/lib/sports/teams"

// Portraits already looked up this session, by name (null = none found).
const photos = new Map<string, string | null>()
const pending = new Map<string, Promise<string | null>>()

function fetchPhoto(name: string, sport: string): Promise<string | null> {
  const key = `${sport}:${name.toLowerCase()}`
  const have = pending.get(key)
  if (have) return have
  const request = fetch(`/api/sports/player-image?sport=${sport}&name=${encodeURIComponent(name)}`)
    .then((r) => (r.ok ? (r.json() as Promise<{ url: string | null }>) : { url: null }))
    .then((d) => d.url)
    .catch(() => null)
    .then((url) => {
      photos.set(key, url)
      return url
    })
  pending.set(key, request)
  return request
}

/** A tennis player's portrait (Wikipedia, freely licensed), or null until one is found. */
function usePlayerPhoto(name: string, sport: string, enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(() => (enabled ? (photos.get(`${sport}:${name.toLowerCase()}`) ?? null) : null))
  useEffect(() => {
    if (!enabled) return
    let live = true
    void fetchPhoto(name, sport).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [name, sport, enabled])
  return url
}

/** A team's mark: its logo when it loads, a tennis player's portrait, otherwise initials on the team colour. */
export function TeamBadge({ sport, name, size = 36, bare = true }: { sport?: string; name: string; size?: number; bare?: boolean }) {
  const look = teamLook(sport, name)
  const { resolvedTheme } = useTheme()
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [failedDarkSrc, setFailedDarkSrc] = useState<string | null>(null)
  const photo = usePlayerPhoto(name, sport ?? "tennis", sport === "tennis")
  const src = sport === "tennis" ? photo : look.logo
  const isPhoto = sport === "tennis"
  const failed = src != null && failedSrc === src
  const darkSrc = resolvedTheme === "dark" && look.logoDark && failedDarkSrc !== look.logoDark ? look.logoDark : null
  // Bare: just the team logo, floating, with no coloured disc or white square behind it.
  if (bare && src && !failed && !isPhoto) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="sp-logo-bare" src={darkSrc ?? src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => darkSrc ? setFailedDarkSrc(darkSrc) : setFailedSrc(src)} title={name} style={{ width: size, height: size }} />
  }
  return (
    <span className="sp-badge" data-photo={isPhoto || undefined} style={{ width: size, height: size, background: look.color, color: onColor(look.color), fontSize: size * 0.34 }} aria-hidden title={name}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} style={isPhoto ? undefined : { background: "#fff" }} />
      ) : (
        look.abbr
      )}
    </span>
  )
}

/** An NFL or NBA player's portrait (props), or their initials until one is found. */
export function PlayerBadge({ sport, name, size = 36 }: { sport: string; name: string; size?: number }) {
  const photo = usePlayerPhoto(name, sport, true)
  const [failed, setFailed] = useState(false)
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
  return (
    <span className="sp-badge" data-photo style={{ width: size, height: size, background: "#475569", color: "#fff", fontSize: size * 0.34 }} aria-hidden title={name}>
      {photo && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        initials
      )}
    </span>
  )
}
