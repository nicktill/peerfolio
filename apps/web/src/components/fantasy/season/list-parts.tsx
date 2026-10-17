"use client"

import "@web/components/fantasy/season/fantasy-season.css"

import { CalendarDays, Crown, Lock, PenLine, Swords, Trophy } from "lucide-react"
import { formatPoints } from "@web/components/fantasy/season/season-format"
import { Avatar } from "@web/components/ui/avatar"
import { InfoTip } from "@web/components/ui/tip"
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
          · <Countdown to={round.at} /> left
        </>
      ) : null}
    </span>
  )
}

/** The top of a league's season table, under its row on the list: who is winning this season, at a glance. */
export function SeasonLeaders({ round }: { round: RoundChip }) {
  return (
    <div className="fw-leaders">
      <span className="fw-leaders-label">
        <Crown aria-hidden /> Season {round.seasonNumber} standings
        <InfoTip text="Points from weekly rounds. 1st earns one point per player, last earns one. Most points wins the season." label="How season points work" />
      </span>
      <ol>
        {(round.leaders ?? []).map((l, i) => (
          <li key={l.userId} data-you={l.isYou || undefined}>
            <span className="fw-leaders-av" data-place={i + 1}>
              <Avatar src={l.image} name={l.name} size="sm" />
            </span>
            <b>{l.isYou ? "You" : (l.name?.split(" ")[0] ?? "Player")}</b>
            <em className="numeric">{formatPoints(l.points)} {l.points === 1 ? "pt" : "pts"}</em>
          </li>
        ))}
      </ol>
    </div>
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
        <li><b style={{ fontWeight: 500, color: "var(--fw-fg)" }}>3. Win the week.</b> Optional weekly rounds: a new scoreboard every Monday, a champion at season end.</li>
      </ol>
    </div>
  )
}
