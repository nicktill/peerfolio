"use client"

import "@web/components/fantasy/season/fantasy-season.css"

import { CalendarDays, Lock, PenLine, Swords, Trophy } from "lucide-react"
import { Choice, Row } from "@web/components/fantasy/choice"
import { Countdown } from "@web/components/fantasy/season/season-parts"
import type { RoundChip } from "@web/lib/fantasy-season-view"

/** One line of round status for a league on the list: "Round 3 / 2d 4h left", or a nudge to make picks. */
export function RoundMeta({ round }: { round: RoundChip | null | undefined }) {
  if (!round) return null
  if (round.kind === "complete") {
    return (
      <span>
        <Trophy aria-hidden /> Season {round.seasonNumber} done
      </span>
    )
  }
  if (round.kind === "upcoming") {
    return (
      <span>
        <CalendarDays aria-hidden /> {round.mode === "draft" && round.needsPicks ? "Make your picks" : "Season starts soon"}
      </span>
    )
  }
  if (round.kind === "draft-open" && round.at) {
    return (
      <span style={round.needsPicks ? { color: "var(--gold-ink, var(--fw-fg2))" } : undefined}>
        <PenLine aria-hidden /> {round.needsPicks ? "Picks needed" : "Picks in"} / locks <Countdown to={round.at} />
      </span>
    )
  }
  return (
    <span>
      {round.kind === "round-locked" ? <Lock aria-hidden /> : <Swords aria-hidden />}
      Round {round.round}
      {round.at ? (
        <>
          {" "}
          / <Countdown to={round.at} /> left
        </>
      ) : null}
    </span>
  )
}

/** "How it plays" for the create form: trading all week, or a weekly stock draft. */
export function SeasonFormatRow({ mode, picks, onChange }: { mode: "trading" | "draft"; picks: number; onChange: (next: { mode: "trading" | "draft"; picks: number }) => void }) {
  return (
    <>
      <Row label="How it plays">
        <Choice active={mode === "trading"} onClick={() => onChange({ mode: "trading", picks })}>
          Free trading
        </Choice>
        <Choice active={mode === "draft"} onClick={() => onChange({ mode: "draft", picks })}>
          Weekly draft
        </Choice>
      </Row>
      <p className="fs-hint" style={{ marginTop: -10 }}>
        {mode === "draft" ? "Each week everyone picks stocks before the weekly lock. Equal weight, scored on the closes." : "Trade whenever you like. Every Monday a new round ranks the week's returns."}
      </p>
      {mode === "draft" ? (
        <Row label="Picks per week">
          {[3, 5, 8].map((p) => (
            <Choice key={p} active={picks === p} onClick={() => onChange({ mode, picks: p })}>
              {p}
            </Choice>
          ))}
        </Row>
      ) : null}
    </>
  )
}

/** First-run state: what the game is, in three lines, and what to do first. */
export function FantasyEmpty() {
  return (
    <div className="fw-empty-state">
      <svg className="fw-empty-art" viewBox="0 0 120 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ margin: "0 auto 12px", width: 120 }}>
        <path d="M8 56h104" opacity=".4" />
        <path d="M14 48l22-14 18 8 24-22 20 10 10-12" />
        <circle cx="108" cy="18" r="3.5" />
      </svg>
      <p style={{ font: "500 15px/22px var(--fw-sans)", color: "var(--fw-fg)" }}>No fantasy leagues yet</p>
      <ol style={{ listStyle: "none", margin: "14px auto 0", padding: 0, maxWidth: 360, display: "grid", gap: 8, textAlign: "left", fontSize: 13, lineHeight: "20px" }}>
        <li><b style={{ fontWeight: 500, color: "var(--fw-fg)" }}>1. Start a league.</b> Same play cash for everyone.</li>
        <li><b style={{ fontWeight: 500, color: "var(--fw-fg)" }}>2. Send the invite link</b> to the group chat.</li>
        <li><b style={{ fontWeight: 500, color: "var(--fw-fg)" }}>3. Win the week.</b> A new round every Monday, a champion at season end.</li>
      </ol>
    </div>
  )
}
