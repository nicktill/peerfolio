"use client"

import { useEffect, useState } from "react"
import { sampleResponse } from "@web/lib/sample/fixtures"
import { gameChart, historyBand, type Sample } from "@web/lib/sports/live/trend"
import { onColor } from "@web/lib/sports/teams"

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
const H = 64
const PILL = 18

/**
 * Both teams' win chance on one chart, as step lines in their team colours over real time, ending at the current chance
 * (the same number the win-probability bar shows). It only shows what the market has actually quoted: no smoothing, and
 * nothing before the first quote. The slot has a fixed height so the card does not reflow when history arrives.
 * View only; `live` is the current home chance (0..1).
 */
export function GameChart({ eventId, away, home, awayColor, homeColor, live }: { eventId: string; away: string; home: string; awayColor: string; homeColor: string; live?: number | null }) {
  const series = useGameHistory(eventId)
  const g = gameChart(series, live, Date.now(), W, H)
  if (!g) return <div className="sp-gchart sp-gchart-slot" aria-hidden="true" />
  // End pills sit at each line's end; nudge them apart when the lines finish close together.
  let hy = g.homeEnd[1]
  let ay = g.awayEnd[1]
  if (Math.abs(hy - ay) < PILL) {
    const mid = (hy + ay) / 2
    const up = Math.min(hy, ay) === hy ? -1 : 1
    hy = mid + (up * PILL) / 2
    ay = mid - (up * PILL) / 2
  }
  const clampY = (v: number) => Math.min(H - PILL / 2, Math.max(PILL / 2, v))
  const label = `Win chance: ${away} ${g.awayPct} percent, ${home} ${g.homePct} percent`
  return (
    <div className="sp-gchart" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" focusable="false" aria-hidden="true">
        <line x1={0} x2={W} y1={g.midY} y2={g.midY} stroke="currentColor" strokeWidth={1} strokeDasharray="2 4" opacity={0.25} vectorEffect="non-scaling-stroke" />
        <path d={g.away} fill="none" stroke={awayColor} strokeWidth={1.8} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={g.home} fill="none" stroke={homeColor} strokeWidth={1.8} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="sp-gchart-pill numeric" style={{ top: clampY(ay) - PILL / 2, background: awayColor, color: onColor(awayColor) }}>{g.awayPct}%</span>
      <span className="sp-gchart-pill numeric" style={{ top: clampY(hy) - PILL / 2, background: homeColor, color: onColor(homeColor) }}>{g.homePct}%</span>
    </div>
  )
}

/** Compact history band used by the market overview. */
export function HistoryTrack({ series, live, awayColor, homeColor }: { series: Sample[]; live?: number | null; awayColor: string; homeColor: string }) {
  const b = historyBand(series, live, Date.now(), W, 16)
  if (!b) return null
  return (
    <svg className="sp-hist" viewBox={`0 0 ${W} 16`} preserveAspectRatio="none" focusable="false" aria-hidden="true">
      <rect width={W} height={16} fill={homeColor} />
      <path d={b.away} fill={awayColor} />
      <path d={b.line} fill="none" stroke="var(--fw-bg, #000)" strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.85} />
    </svg>
  )
}
