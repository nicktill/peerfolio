"use client"

import { formatCredits } from "@web/lib/sports/format"
import "@web/components/fantasy/season/fantasy-season.css"

import { CalendarDays, Crown, Lock, PenLine, Swords, TrendingUp, Trophy } from "lucide-react"
import { formatPoints } from "@web/components/fantasy/season/season-format"
import { formatPercent } from "@web/lib/format"
import { EmptyScene } from "@web/components/ui/empty-scene"
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

type StandingPerson = { name: string | null; image?: string | null; value: string; isYou: boolean }

/** One board's preview: where you stand, then the top three as ringed chips (gold, silver, bronze). */
function StandingHalf({ label, tip, icon, you, total, people }: { label: string; tip: string; icon: React.ReactNode; you: number | null; total?: number; people: StandingPerson[] }) {
  return (
    <div className="ls-half">
      <div className="ls-main">
        <span className="ls-label">
          {icon} {label}
          <InfoTip text={tip} label={`About ${label}`} />
        </span>
        <div className="ls-chips">
          {people.map((l, i) => (
            <span key={`${l.name}-${i}`} className="fw-leaders-chip" data-you={l.isYou || undefined}>
              <span className="fw-leaders-av" data-place={i + 1}>
                <Avatar src={l.image} name={l.name} size="sm" />
              </span>
              <b>{l.isYou ? "You" : (l.name?.split(" ")[0] ?? "Player")}</b>
              <em className="numeric">{l.value}</em>
            </span>
          ))}
        </div>
      </div>
      {you ? (
        <span className="ls-you" aria-label={`You are number ${you}${total ? ` of ${total}` : ""}`}>
          <b>#{you}</b>
          {total ? <small>of {total}</small> : <small>&nbsp;</small>}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Under a league row: the long race and (when weekly rounds are on) the season, side by side, each with
 * your place and its top three. Sits inside the row's one link.
 */
export function ListStandings({
  race,
  raceYou,
  total,
  season,
}: {
  race: { name: string | null; image: string | null; percent: number; isYou: boolean }[]
  raceYou: number | null
  total: number
  season?: RoundChip | null
}) {
  const seasonPeople = (season?.leaders ?? []).map((l) => ({ name: l.name, image: l.image, value: `${formatPoints(l.points)} ${l.points === 1 ? "pt" : "pts"}`, isYou: l.isYou }))
  const racePeople = race.map((l) => ({ name: l.name, image: l.image, value: formatPercent(l.percent, 2), isYou: l.isYou }))
  if (racePeople.length === 0 && seasonPeople.length === 0) return null
  return (
    <div className="ls" data-two={seasonPeople.length > 0 && racePeople.length > 0 ? "" : undefined}>
      {racePeople.length > 0 ? <StandingHalf label="Long race" icon={<TrendingUp aria-hidden />} tip="Ranked on total return since the league started." you={raceYou} total={total} people={racePeople} /> : null}
      {seasonPeople.length > 0 && season ? (
        <StandingHalf label={`Season ${season.seasonNumber}`} icon={<Crown aria-hidden />} tip="Points from weekly rounds. 1st each week earns one point per player, last earns one." you={season.seasonRank} total={season.seasonPlayers || undefined} people={seasonPeople} />
      ) : null}
    </div>
  )
}

/** Sports list row: the top three by credits. */
export function SportsStandings({ leaders, total }: { leaders: { name: string; image?: string | null; credits: number; isYou: boolean }[]; total: number }) {
  if (leaders.length === 0) return null
  const you = leaders.find((l) => l.isYou)
  const rank = you ? leaders.indexOf(you) + 1 : null
  return (
    <div className="ls">
      <StandingHalf
        label="Standings"
        icon={<Crown aria-hidden />}
        tip="Ranked on credits, counting picks that are still riding."
        you={rank}
        total={total}
        people={leaders.map((l) => ({ name: l.name, image: l.image, value: formatCredits(l.credits), isYou: l.isYou }))}
      />
    </div>
  )
}

/** First-run state: what the game is, and what to do first. */
export function FantasyEmpty({ action }: { action?: React.ReactNode }) {
  return <EmptyScene kind="leagues" title="No fantasy leagues yet" body="Start a league with the same play cash for everyone, send the invite link to the group chat, and let the returns talk." action={action} />
}
