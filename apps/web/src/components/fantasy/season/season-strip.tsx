"use client"

import "@web/components/fantasy/season/fantasy-season.css"

import Link from "next/link"
import { ArrowRight, CalendarDays, Crown, Swords } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { Delta } from "@web/components/ui/delta"
import { personName, useNow } from "@web/components/fantasy/season/season-parts"
import { formatPoints, ordinal, roundProgress } from "@web/components/fantasy/season/season-format"
import type { SeasonView } from "@web/lib/fantasy-season-view"

/** One bar for the week, ticked per day, with a marker on today. */
export function WeekBar({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const now = useNow()
  const f = roundProgress(startsAt, endsAt, now)
  const day = Math.min(6, Math.floor(f * 7))
  return (
    <div className="fs-week" role="progressbar" aria-label="Week progress" aria-valuemin={0} aria-valuemax={7} aria-valuenow={Math.round(f * 70) / 10} aria-valuetext={`Day ${day + 1} of 7`}>
      <div className="fs-week-track">
        <i style={{ width: `${f * 100}%` }} />
        <b style={{ left: `${f * 100}%` }}>{new Date(now).toLocaleDateString("en-US", { weekday: "short" })}</b>
      </div>
    </div>
  )
}

/** The two tables behind the summary: this round so far, and the season standings. */
export function SeasonTables({ data, leagueId }: { data: SeasonView; leagueId: string }) {
  const { season, current, standings, recap } = data
  const rows = (current?.rows ?? []).filter((r) => r.picked !== false)
  const you = rows.find((r) => r.isYou)
  const top = standings.filter((s) => s.rank !== 1 || standings.some((x) => x.rank !== 1)).slice(0, 5)
  const complete = season.state === "complete"
  return (
    <div className="fs-card-cols">
      <div className="fs-col">
        <h3>
          <Swords aria-hidden /> {current ? `Round ${current.number} so far` : "This round"}
        </h3>
        {rows.length === 0 ? (
          <p className="fs-card-empty">{complete ? "Final standings are on the right." : season.state === "upcoming" ? "Round 1 starts Monday. Trade as usual." : "Nobody has traded yet this week."}</p>
        ) : (
          <ol className="fs-mini">
            {rows.slice(0, 5).map((r) => (
              <li key={r.userId} data-you={r.isYou || undefined}>
                <span className="fs-mini-rank" data-rank={r.rank}>{r.rank}</span>
                <Avatar src={r.image} name={r.name} handle={r.handle} size="sm" />
                <b>{personName(r)}</b>
                <Delta value={r.percent} size="sm" variant="plain" />
              </li>
            ))}
          </ol>
        )}
        {you ? (
          <p className="fs-card-you">
            You&apos;re <b>{ordinal(you.rank)}</b> this round. If it ended now: <b>{formatPoints(you.points)} {you.points === 1 ? "pt" : "pts"}</b>.
          </p>
        ) : null}
      </div>
      <div className="fs-col">
        <h3>
          <Crown aria-hidden /> Season {season.number} standings
        </h3>
        {top.length === 0 ? (
          <p className="fs-card-empty">Standings appear when Round 1 closes.</p>
        ) : (
          <ol className="fs-mini">
            {top.slice(0, 5).map((s) => (
              <li key={s.userId} data-you={s.isYou || undefined}>
                <span className="fs-mini-rank" data-rank={s.rank}>{s.rank}</span>
                <Avatar src={s.image} name={s.name} handle={s.handle} size="sm" />
                <b>{personName(s)}</b>
                <em className="numeric">{formatPoints(s.points)} {s.points === 1 ? "pt" : "pts"}</em>
              </li>
            ))}
          </ol>
        )}
        {recap ? (
          <p className="fs-card-you">
            <CalendarDays aria-hidden /> Last round: {recap.headline}
          </p>
        ) : null}
        <Link href={`/fantasy/${leagueId}/season`} className="fs-card-link">
          {complete && data.canStartNext ? "Start next season" : "Open the season"} <ArrowRight aria-hidden />
        </Link>
      </div>
    </div>
  )
}
