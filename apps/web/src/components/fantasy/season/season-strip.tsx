"use client"

import "@web/components/fantasy/season/fantasy-season.css"

import Link from "next/link"
import { ArrowRight, CalendarDays, Crown, Lock, PenLine, Swords } from "lucide-react"
import { Countdown } from "@web/components/fantasy/season/season-parts"
import { formatDay, ordinal } from "@web/components/fantasy/season/season-format"
import { formatPercent } from "@web/lib/format"
import { useApi } from "@web/lib/use-api"
import type { SeasonView } from "@web/lib/fantasy-season-view"

/**
 * One line on the league page: which round it is, when it closes, where you
 * stand, and what to do next (usually "make your picks"). The detail is on the season page.
 */
export function SeasonStrip({ leagueId }: { leagueId: string }) {
  const { data } = useApi<SeasonView>(`/api/fantasy/${leagueId}/season`, [], { refreshMs: 60_000 })
  if (!data) return <div className="fw-skeleton animate-pulse" style={{ height: 64 }} aria-hidden />
  if ("none" in data) return null

  const { season, current, draft, standings, recap } = data
  const hub = `/fantasy/${leagueId}/season`
  const you = current?.rows.find((r) => r.isYou && r.picked !== false)
  const mine = draft?.yours.length ?? 0
  const urgent = !!draft?.open && mine === 0 && draft.msLeft < 24 * 3_600_000

  let Icon = CalendarDays
  let title = ""
  let detail: React.ReactNode = null
  let cta = "Season"

  if (season.state === "complete") {
    Icon = Crown
    const champion = standings[0]
    title = `Season ${season.number} is complete`
    detail = champion ? <><b>{champion.isYou ? "You" : (champion.name ?? champion.handle)}</b> won it with {champion.points} pts</> : "No rounds were played"
    cta = data.canStartNext ? "Start next season" : "See results"
  } else if (season.state === "upcoming") {
    title = draft ? `Draft is open for Round ${draft.number}` : `Season ${season.number} starts ${formatDay(season.startsAt)}`
    detail = draft ? <>Picks lock <Countdown to={draft.deadline} /> from now / {mine} of {draft.slots} picked</> : "Weekly rounds, scored on returns"
    Icon = draft ? PenLine : CalendarDays
    cta = draft ? (mine > 0 ? "Edit picks" : "Make picks") : "Season"
  } else if (draft?.open) {
    Icon = PenLine
    title = `Draft open for Round ${draft.number}`
    detail = <>Locks in <b><Countdown to={draft.deadline} /></b> / {mine === 0 ? "you haven't picked yet" : `${mine} of ${draft.slots} picked`}</>
    cta = mine > 0 ? "Edit picks" : "Make picks"
  } else if (current) {
    Icon = draft ? Lock : Swords
    title = `Round ${current.number}${season.roundCount ? ` of ${season.roundCount}` : ""}`
    detail = (
      <>
        Closes in <b><Countdown to={current.endsAt} /></b>
        {you ? <> / you are {ordinal(you.rank)} at {formatPercent(you.percent, 2)}</> : null}
      </>
    )
    cta = "Round details"
  } else {
    title = `Season ${season.number}`
    detail = "Waiting for the next round"
  }

  return (
    <section className="fw-panel fs-strip" data-urgent={urgent || undefined} aria-label="Season">
      <span className="fs-strip-icon">
        <Icon aria-hidden />
      </span>
      <div className="fs-strip-body">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <div className="fs-strip-actions">
        {recap && season.state !== "complete" ? (
          <Link href={`${hub}#recap`} className="fs-strip-new">
            <i aria-hidden /> Round {recap.roundNumber} recap
          </Link>
        ) : null}
        <Link href={hub} className="fw-btn" data-solid={urgent || (draft?.open && mine === 0) || undefined}>
          {cta}
          <ArrowRight aria-hidden />
        </Link>
      </div>
    </section>
  )
}
