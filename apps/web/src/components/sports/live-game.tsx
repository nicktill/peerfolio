"use client"

import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Radio } from "lucide-react"
import { PIPELINE } from "@web/lib/sports/live/freshness"
import { chipFor, PAUSED_REASON, splitPct, splitPct3, statusLine } from "@web/lib/sports/live/format"
import { livePosition, type PositionPick } from "@web/lib/sports/live/position"
import { ageView, type LiveView } from "@web/lib/sports/live/view"
import { formatCredits, signedCredits } from "@web/lib/sports/format"
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
      const res = await fetch(`/api/sports/live/${id}`, { cache: "no-store" })
      if (res.ok) {
        // Time the response spent in the CDN is reported by the Age header; count it, so a cached answer never looks fresher than it is.
        const cdnAgeMs = Number(res.headers.get("age") ?? 0) * 1000
        const view = (await res.json()) as LiveView
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
  const position = pick ? livePosition(pick, view, elapsedMs, active) : null
  const dim = (side: string) => (mine === "home" || mine === "away" || mine === "draw") && mine !== side
  return (
    <div className="sl-live" data-tone={chip.tone} role="group" aria-label="Live game status">
      <div className="sl-live-top">
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
      </div>
      {split ? (
        <>
          <div className="sl-live-bar" role="img" aria-label={`Win probability: ${away} ${split.away} percent, ${split.draw != null ? `draw ${split.draw} percent, ` : ""}${home} ${split.home} percent`}>
            <span data-dim={dim("away") || undefined} style={{ width: `${split.away}%`, background: a.color }} />
            {split.draw != null ? <span data-dim={dim("draw") || undefined} style={{ width: `${split.draw}%`, background: "var(--fw-fg3)" }} /> : null}
            <span data-dim={dim("home") || undefined} style={{ width: `${split.home}%`, background: h.color }} />
          </div>
          <div className="sl-live-odds numeric">
            <span data-mine={mine === "away" || undefined}>{a.abbr} <LiveNumber value={split.away} format={pctText} kind="pct" /></span>
            {split.draw != null ? <span data-mine={mine === "draw" || undefined}>Draw <LiveNumber value={split.draw} format={pctText} kind="pct" /></span> : null}
            <span data-mine={mine === "home" || undefined}>{h.abbr} <LiveNumber value={split.home} format={pctText} kind="pct" /></span>
          </div>
          {odds && odds.confidence === "low" ? <p className="sl-live-note">{odds.mismatch ? "Sources differ, treat as rough" : "Thin market, treat as rough"}</p> : null}
        </>
      ) : view && view.odds.status === "paused" && view.status !== "final" ? (
        <p className="sl-live-note">{PAUSED_REASON[view.odds.reason] ?? "Odds paused"}</p>
      ) : chip.tone === "paused" ? (
        <p className="sl-live-note">{PAUSED_REASON.stale}</p>
      ) : null}
      {position ? (
        <div className="sl-live-value numeric" data-tone={position.pl > 0.5 ? "up" : position.pl < -0.5 ? "down" : undefined}>
          <span>Est. value <b>{formatCredits(position.value)}</b></span>
          <strong>
            {position.pl > 0.5 ? <ArrowUp aria-hidden /> : position.pl < -0.5 ? <ArrowDown aria-hidden /> : null}
            {signedCredits(position.pl)}
          </strong>
        </div>
      ) : null}
      <p className="sl-live-fine">{pick ? "Estimate from the live market, view only. No cash-out; your pick keeps its accepted price and payout." : "Market-implied chance, view only."}</p>
    </div>
  )
}
