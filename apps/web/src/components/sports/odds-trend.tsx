"use client"

import { useEffect, useState } from "react"
import { sampleResponse } from "@web/lib/sample/fixtures"
import { MIN_TREND_POINTS, sparkline, trendDescription, withLive } from "@web/lib/sports/live/trend"

type Entry = { points: number[]; at: number; subs: number; timer: number | undefined; listeners: Set<() => void> }
/** One history poll per game, shared by both team rows. */
const games = new Map<string, Entry>()
const REFRESH_MS = 60_000

async function load(id: string, e: Entry) {
  if (document.visibilityState === "visible") {
    try {
      const url = `/api/sports/live/history?eventId=${encodeURIComponent(id)}`
      const fixture = sampleResponse(url, window.location.pathname) as { points?: number[] } | null
      const res = fixture ? null : await fetch(url)
      if (fixture || res?.ok) {
        const body = fixture ?? ((await res!.json()) as { points?: number[] })
        e.points = Array.isArray(body.points) ? body.points : []
        e.at = Date.now()
        e.listeners.forEach((l) => l())
      }
    } catch {
      /* decorative; ignore */
    }
  }
  if (e.subs > 0) e.timer = window.setTimeout(() => void load(id, e), REFRESH_MS)
}

function useHistory(eventId: string): number[] {
  const [, rerender] = useState(0)
  useEffect(() => {
    let e = games.get(eventId)
    if (!e) {
      e = { points: [], at: 0, subs: 0, timer: undefined, listeners: new Set() }
      games.set(eventId, e)
    }
    const entry = e
    const l = () => rerender((n) => n + 1)
    entry.listeners.add(l)
    if (entry.subs++ === 0) void load(eventId, entry)
    return () => {
      entry.listeners.delete(l)
      if (--entry.subs === 0) {
        window.clearTimeout(entry.timer)
        games.delete(eventId)
      }
    }
  }, [eventId])
  return games.get(eventId)?.points ?? []
}

/**
 * Small win-probability sparkline for a team row. `side` is which team the row is: the line shows that team's chance
 * (the other row shows the mirror). `live` is the current home probability, appended so the end matches the bar.
 * The slot is reserved up front so the row does not reflow when history arrives.
 */
export function OddsTrend({ eventId, side, color, team, live }: { eventId: string; side: "home" | "away"; color: string; team: string; live?: number | null }) {
  const points = useHistory(eventId)
  const s = points.length >= MIN_TREND_POINTS ? sparkline(withLive(points, live), side === "away") : null
  if (!s) return <span className="sp-spark sp-spark-slot" aria-hidden="true" />
  const tone = s.direction === "up" ? "var(--gain)" : s.direction === "down" ? "var(--loss)" : color
  const desc = trendDescription(team, s.change)
  return (
    <span className="sp-spark" role="img" aria-label={desc} data-dir={s.direction}>
      <svg width={64} height={26} viewBox="0 0 64 26" focusable="false" aria-hidden="true">
        <title>{desc}</title>
        <line x1={3} x2={61} y1={s.startY} y2={s.startY} stroke="currentColor" strokeWidth={1} strokeDasharray="2 3" opacity={0.3} vectorEffect="non-scaling-stroke" />
        <path d={s.d} fill="none" stroke={tone} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={s.last[0]} cy={s.last[1]} r={2.2} fill={tone} />
      </svg>
    </span>
  )
}
