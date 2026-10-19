"use client"

import { useEffect, useState } from "react"
import { sampleResponse } from "@web/lib/sample/fixtures"
import { historyBand, type Sample } from "@web/lib/sports/live/trend"

type Entry = { series: Sample[]; at: number; subs: number; timer: number | undefined; listeners: Set<() => void> }
/** One history poll per game. */
const games = new Map<string, Entry>()
const REFRESH_MS = 60_000
const EMPTY: Sample[] = []

async function load(id: string, e: Entry) {
  if (document.visibilityState === "visible") {
    try {
      const url = `/api/sports/live/history?eventId=${encodeURIComponent(id)}`
      const fixture = sampleResponse(url, window.location.pathname) as { series?: Sample[] } | null
      const res = fixture ? null : await fetch(url)
      if (fixture || res?.ok) {
        const body = fixture ?? ((await res!.json()) as { series?: Sample[] })
        e.series = Array.isArray(body.series) ? body.series : []
        e.at = Date.now()
        e.listeners.forEach((l) => l())
      }
    } catch {
      /* decorative; ignore */
    }
  }
  if (e.subs > 0) e.timer = window.setTimeout(() => void load(id, e), REFRESH_MS)
}

/** The timed win-chance history for a tracked game (home chance, 0..1). Pass undefined to skip. */
export function useGameHistory(eventId: string | undefined): Sample[] {
  const [, rerender] = useState(0)
  useEffect(() => {
    if (!eventId) return
    let e = games.get(eventId)
    if (!e) {
      e = { series: [], at: 0, subs: 0, timer: undefined, listeners: new Set() }
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
  return (eventId && games.get(eventId)?.series) || EMPTY
}

const W = 300
const H = 16

/**
 * The win-chance bar as history: the away share on top and the home share below, drawn over real time as a step line
 * and ending at the current split (the same numbers the labels show). It only draws what the market has quoted, with no
 * smoothing. Returns null until there is enough history, so the plain bar shows instead. View only.
 */
export function HistoryTrack({ series, live, awayColor, homeColor }: { series: Sample[]; live?: number | null; awayColor: string; homeColor: string }) {
  const b = historyBand(series, live, Date.now(), W, H)
  if (!b) return null
  return (
    <svg className="sp-hist" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" focusable="false" aria-hidden="true">
      <rect width={W} height={H} fill={homeColor} />
      <path d={b.away} fill={awayColor} />
      <path d={b.line} fill="none" stroke="var(--fw-bg, #000)" strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.85} />
    </svg>
  )
}
