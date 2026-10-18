"use client"

import { useEffect, useState } from "react"
import { sampleResponse } from "@web/lib/sample/fixtures"
import { MIN_TREND_POINTS, sparkline } from "@web/lib/sports/live/trend"

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
 * (the other row shows the mirror). Decorative: aria-hidden, renders nothing without enough history.
 */
export function OddsTrend({ eventId, side, color }: { eventId: string; side: "home" | "away"; color: string }) {
  const points = useHistory(eventId)
  if (points.length < MIN_TREND_POINTS) return null
  const s = sparkline(points, side === "away")
  if (!s) return null
  return (
    <svg className="sp-spark" width={64} height={26} viewBox="0 0 64 26" aria-hidden="true" focusable="false">
      <line x1={3} x2={61} y1={13} y2={13} stroke="currentColor" strokeWidth={1} strokeDasharray="2 3" opacity={0.25} vectorEffect="non-scaling-stroke" />
      <path d={s.d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={s.last[0]} cy={s.last[1]} r={2.2} fill={color} />
    </svg>
  )
}
