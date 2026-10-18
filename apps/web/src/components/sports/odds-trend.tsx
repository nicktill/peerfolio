"use client"

import { useEffect, useState } from "react"
import { MIN_TREND_POINTS, trendPath } from "@web/lib/sports/live/trend"

type Entry = { points: number[]; at: number; subs: number; timer: number | undefined; listeners: Set<() => void> }
/** One history poll per game, shared by both team rows. */
const games = new Map<string, Entry>()
const REFRESH_MS = 60_000

async function load(id: string, e: Entry) {
  if (document.visibilityState === "visible") {
    try {
      const res = await fetch(`/api/sports/live/history?eventId=${encodeURIComponent(id)}`)
      if (res.ok) {
        const body = (await res.json()) as { points?: number[] }
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
 * Faded win-probability history behind a team row. `side` is which team the row is: the line shows that team's chance
 * (the other row shows the mirror). Decorative: aria-hidden, renders nothing without enough history.
 */
export function OddsTrend({ eventId, side, color }: { eventId: string; side: "home" | "away"; color: string }) {
  const points = useHistory(eventId)
  if (points.length < MIN_TREND_POINTS) return null
  return (
    <svg className="sp-odds-trend" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={trendPath(points, side === "away")} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
