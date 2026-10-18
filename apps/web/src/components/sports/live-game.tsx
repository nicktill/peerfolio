"use client"

import { sampleResponse } from "@web/lib/sample/fixtures"
import { useEffect, useState } from "react"
import { Radio } from "lucide-react"
import { PIPELINE } from "@web/lib/sports/live/freshness"
import { chipFor, PAUSED_REASON, splitPct, splitPct3, statusLine } from "@web/lib/sports/live/format"
import type { PositionPick } from "@web/lib/sports/live/position"
import { ageView, type LiveView } from "@web/lib/sports/live/view"
import { teamLook } from "@web/lib/sports/teams"
import { LiveNumber } from "./live-delta"

const pctText = (n: number) => `${n}%`
const scoreText = (n: number) => String(n)

type Entry = { view: LiveView | null; receivedAt: number; subs: number; timer: number | undefined; failures: number; listeners: Set<() => void> }
/** One poll per game for the whole page, however many tickets show it (module level, shared by every strip). */
const games = new Map<string, Entry>()

async function pollOnce(id: string, entry: Entry) {
  if (document.visibilityState === "visible") {
    try {
      const url = `/api/sports/live/${id}`
      const fixture = sampleResponse(url, window.location.pathname) as LiveView | null
      const res = fixture ? null : await fetch(url, { cache: "no-store" })
      if (fixture || res?.ok) {
        // Time the response spent in the CDN is reported by the Age header; count it, so a cached answer never looks fresher than it is.
        const cdnAgeMs = Number(res?.headers.get("age") ?? 0) * 1000
        const view = fixture ?? (await res!.json()) as LiveView
        entry.view = cdnAgeMs > 0 ? ageView(view, cdnAgeMs) : view
        entry.receivedAt = Date.now()
        entry.failures = 0
      } else entry.failures++
    } catch {
      entry.failures++
    }
    entry.listeners.forEach((l) => l())
  }
  if (entry.subs > 0) entry.timer = window.setTimeout(() => void pollOnce(id, entry), PIPELINE.clientPollMs * Math.min(4, 1 + entry.failures))
}

function subscribe(id: string, listener: () => void) {
  let entry = games.get(id)
  if (!entry) {
    entry = { view: null, receivedAt: 0, subs: 0, timer: undefined, failures: 0, listeners: new Set() }
    games.set(id, entry)
  }
  entry.listeners.add(listener)
  if (entry.subs++ === 0) void pollOnce(id, entry)
  const e = entry
  return () => {
    e.listeners.delete(listener)
    if (--e.subs === 0) {
      window.clearTimeout(e.timer)
      games.delete(id)
    }
  }
}

/** Reads the shared poll for a game; re-renders every second so the "as of" text keeps counting up between polls. */
export function useLiveGame(eventId: string | undefined, enabled: boolean) {
  const [, rerender] = useState(0)
  useEffect(() => {
    if (!eventId || !enabled) return
    const off = subscribe(eventId, () => rerender((n) => n + 1))
    const clock = window.setInterval(() => rerender((n) => n + 1), 1000)
    return () => {
      off()
      window.clearInterval(clock)
    }
  }, [eventId, enabled])
  const entry = eventId && enabled ? games.get(eventId) : undefined
  return { view: entry?.view ?? null, elapsedMs: entry?.receivedAt ? Date.now() - entry.receivedAt : 0 }
}

/** Several games' shared polls at once (for a parlay's legs). One shared poll per game however many tickets show it. */
export function useLiveGames(eventIds: readonly string[], enabled: boolean) {
  const [, rerender] = useState(0)
  const key = eventIds.join(",")
  useEffect(() => {
    if (!enabled || !key) return
    const offs = key.split(",").map((id) => subscribe(id, () => rerender((n) => n + 1)))
    const clock = window.setInterval(() => rerender((n) => n + 1), 1000)
    return () => {
      offs.forEach((off) => off())
      window.clearInterval(clock)
    }
  }, [key, enabled])
  return new Map(eventIds.map((id) => {
    const entry = enabled ? games.get(id) : undefined
    return [id, { view: entry?.view ?? null, elapsedMs: entry?.receivedAt ? Date.now() - entry.receivedAt : 0 }] as const
  }))
}

/**
 * In-game strip under a pick: score, period/clock, the market's win probability (the user's side highlighted), a compact
 * freshness chip and, for an open moneyline pick, an estimated live value. VIEW ONLY: it offers no way to act on any number,
 * and the pick above keeps its accepted price and payout.
 */
export function LiveGameStrip({ eventId, sport, home, away, active, pick, onFinal }: { eventId?: string; sport: string; home: string; away: string; active: boolean; pick?: PositionPick; onFinal?: () => void }) {
  const { view, elapsedMs } = useLiveGame(eventId, active)
  const isFinal = view?.status === "final"
  useEffect(() => { if (isFinal) onFinal?.() }, [isFinal, onFinal])
  if (!eventId || !active) return null
  const chip = chipFor(view, elapsedMs)
  const odds = view?.odds.status === "ok" && chip.tone !== "paused" ? view.odds : null
  const split = odds ? (odds.drawProb != null ? splitPct3(odds.homeProb, odds.drawProb) : { ...splitPct(odds.homeProb), draw: null }) : null
  const h = teamLook(sport, home)
  const a = teamLook(sport, away)
  const line = view ? statusLine(view) : null
  const mine = pick && (pick.kind === "moneyline" || pick.kind === "spread") ? pick.selection : null
  const dim = (side: string) => (mine === "home" || mine === "away" || mine === "draw") && mine !== side
  const mineProb = split && (mine === "home" || mine === "away" || mine === "draw") ? split[mine] : null
  const note = split ? (odds && odds.confidence === "low" ? (odds.mismatch ? "Sources differ, treat as rough" : "Thin market, treat as rough") : null) : view && view.odds.status === "paused" && view.status !== "final" ? (PAUSED_REASON[view.odds.reason] ?? "Odds paused") : chip.tone === "paused" ? PAUSED_REASON.stale : null
  const fine = pick ? "Estimate from the live market, view only. No cash-out; your pick keeps its accepted price and payout." : "Market-implied chance, view only."
  return (
    <div className="sl-live" data-tone={chip.tone} role="group" aria-label="Live game status" title={note ? `${note}. ${fine}` : fine}>
      <span className="sl-live-chip" data-tone={chip.tone}>
        <Radio aria-hidden />
        {chip.label}
        {chip.ago ? <small>{chip.ago.replace(" ago", "")}</small> : null}
      </span>
      {view?.score ? (
        <span className="sl-live-score numeric">
          {a.abbr} <LiveNumber value={view.score.away} format={scoreText} kind="score" seenKey={`strip:${eventId}:a`} /> <i>·</i> {h.abbr} <LiveNumber value={view.score.home} format={scoreText} kind="score" seenKey={`strip:${eventId}:h`} />
        </span>
      ) : null}
      {line ? <span className="sl-live-clock numeric">{line}</span> : null}
      {split ? (
        <span className="sl-live-prob numeric">
          <span className="sl-live-bar" role="img" aria-label={`Win probability: ${away} ${split.away} percent, ${split.draw != null ? `draw ${split.draw} percent, ` : ""}${home} ${split.home} percent`}>
            <span data-dim={dim("away") || undefined} style={{ width: `${split.away}%`, background: a.color }} />
            {split.draw != null ? <span data-dim={dim("draw") || undefined} style={{ width: `${split.draw}%`, background: "var(--fw-fg3)" }} /> : null}
            <span data-dim={dim("home") || undefined} style={{ width: `${split.home}%`, background: h.color }} />
          </span>
          <b>{mineProb != null ? <LiveNumber value={mineProb} format={pctText} kind="pct" /> : <>{`${split.away}% / ${split.home}%`}</>}</b>
        </span>
      ) : null}
      <small className="sl-live-est" aria-hidden>{note ? "Rough" : "Estimate"}</small>
      <span className="sr-only">{fine}{note ? ` ${note}.` : ""}</span>
    </div>
  )
}
