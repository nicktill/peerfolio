"use client"

import { useEffect, useRef, useState } from "react"
import { Radio } from "lucide-react"
import { chipFor, PAUSED_REASON, splitPct, statusLine } from "@web/lib/sports/live/format"
import type { LiveView } from "@web/lib/sports/live/view"
import { teamLook } from "@web/lib/sports/teams"

const POLL_MS = 10_000

/** Polls the cached live endpoint while mounted and the tab is visible. The server does the upstream work; this only reads. */
function useLiveGame(eventId: string | undefined, enabled: boolean) {
  const [view, setView] = useState<LiveView | null>(null)
  const [receivedAt, setReceivedAt] = useState(0)
  const [tick, setTick] = useState(0)
  const failures = useRef(0)

  useEffect(() => {
    if (!eventId || !enabled) return
    let stop = false
    let timer: number | undefined
    const load = async () => {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/sports/live/${eventId}`, { cache: "no-store" })
          if (res.ok && !stop) {
            setView((await res.json()) as LiveView)
            setReceivedAt(Date.now())
            failures.current = 0
          } else failures.current++
        } catch {
          failures.current++
        }
      }
      if (!stop) timer = window.setTimeout(load, POLL_MS * Math.min(4, 1 + failures.current))
    }
    void load()
    // Re-render every second so the "as of" text keeps counting up between polls.
    const clock = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => {
      stop = true
      window.clearTimeout(timer)
      window.clearInterval(clock)
    }
  }, [eventId, enabled])

  void tick
  return { view, elapsedMs: receivedAt ? Date.now() - receivedAt : 0 }
}

/**
 * In-game strip under a pick: score, period/clock, the market's win probability and a freshness chip.
 * VIEW ONLY: it offers no way to act on the number, and the pick above keeps its accepted price and payout.
 */
export function LiveGameStrip({ eventId, sport, home, away, active }: { eventId?: string; sport: string; home: string; away: string; active: boolean }) {
  const { view, elapsedMs } = useLiveGame(eventId, active)
  if (!eventId || !active) return null
  const chip = chipFor(view, elapsedMs)
  const odds = view?.odds.status === "ok" && chip.tone !== "paused" ? view.odds : null
  const split = odds ? splitPct(odds.homeProb) : null
  const h = teamLook(sport, home)
  const a = teamLook(sport, away)
  const line = view ? statusLine(view) : null
  return (
    <div className="sl-live" data-tone={chip.tone} role="group" aria-label="Live game status">
      <div className="sl-live-top">
        <span className="sl-live-chip" data-tone={chip.tone}>
          <Radio aria-hidden />
          {chip.label}
          {chip.ago ? <small>{chip.ago}</small> : null}
        </span>
        {view?.score ? (
          <span className="sl-live-score numeric">
            {a.abbr} {view.score.away ?? "–"} <i>·</i> {h.abbr} {view.score.home ?? "–"}
          </span>
        ) : null}
        {line ? <span className="sl-live-clock numeric">{line}</span> : null}
      </div>
      {split ? (
        <>
          <div className="sl-live-bar" role="img" aria-label={`Win probability: ${away} ${split.away} percent, ${home} ${split.home} percent`}>
            <span style={{ width: `${split.away}%`, background: a.color }} />
            <span style={{ width: `${split.home}%`, background: h.color }} />
          </div>
          <div className="sl-live-odds numeric">
            <span>{a.abbr} {split.away}%</span>
            <span>{h.abbr} {split.home}%</span>
          </div>
          {odds && odds.confidence === "low" ? <p className="sl-live-note">{odds.mismatch ? "Sources differ, treat as rough" : "Thin market, treat as rough"}</p> : null}
        </>
      ) : view && view.odds.status === "paused" && view.status !== "final" ? (
        <p className="sl-live-note">{PAUSED_REASON[view.odds.reason] ?? "Odds paused"}</p>
      ) : chip.tone === "paused" ? (
        <p className="sl-live-note">{PAUSED_REASON.stale}</p>
      ) : null}
      <p className="sl-live-fine">Market-implied chance, view only. Your pick keeps its accepted price and payout.</p>
    </div>
  )
}
