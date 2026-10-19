"use client"

import "@web/components/fantasy/season/fantasy-season.css"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, ChevronDown, Medal } from "lucide-react"
import { LeagueBackdrop, watermark } from "@web/components/league/league-mark"
import { Avatar } from "@web/components/ui/avatar"
import { Delta } from "@web/components/ui/delta"
import { InfoTip } from "@web/components/ui/tip"
import { HeadlineNumber } from "@web/components/ui/headline-number"
import { Countdown } from "@web/components/fantasy/season/season-parts"
import { SeasonTables, WeekBar } from "@web/components/fantasy/season/season-strip"
import { formatPoints, ordinal, periodWord, startsLabel } from "@web/components/fantasy/season/season-format"
import { SplitBar } from "@web/components/fantasy/balance-cards"
import { formatCurrency } from "@web/lib/format"
import { cashSplit } from "@web/lib/fantasy-rules"
import { describeMovement } from "@web/lib/rank-change"
import { useApi } from "@web/lib/use-api"
import type { SeasonView } from "@web/lib/fantasy-season-view"

/**
 * The top of a league that runs weekly rounds, as one card: the long race on the left
 * (your rank and return, with the money in one line), the weekly game on the right
 * (the round, its clock, where you stand), and the two tables folded underneath.
 */
export function LeagueTop({ leagueId, rank, total, moved, percent, value, cash, startingCash }: { leagueId: string; rank: number; total: number; moved: number | null; percent: number; value: number; cash: number; startingCash: number }) {
  const { data } = useApi<SeasonView>(`/api/fantasy/${leagueId}/season`, [], { refreshMs: 60_000 })
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try { setOpen(localStorage.getItem("fs-card-open") === "1") } catch {}
  }, [])
  function toggle() {
    setOpen((o) => {
      try { localStorage.setItem("fs-card-open", o ? "0" : "1") } catch {}
      return !o
    })
  }

  const season = data && !("none" in data) ? data : null
  const current = season?.current ?? null
  const mine = current?.rows.find((r) => r.isYou && r.picked !== false)
  const top = season ? season.standings.filter((s) => s.rank !== 1 || season.standings.some((x) => x.rank !== 1)).slice(0, 3) : []
  const profit = Math.round((value - startingCash) * 100) / 100
  const { investedPct } = cashSplit(value, cash)

  return (
    <section className="fw-panel lt" data-emoji={season ? watermark(season.league.emoji) : undefined} aria-label="Standings">
      {season ? <LeagueBackdrop value={season.league.emoji} /> : null}
      <div className="lt-grid">
        <div className="lt-race">
          <span className="lt-k">Long race</span>
          <div className="lt-hero">
            <div>
              <strong className="lt-rank">
                {rank === 0 ? "Unranked" : <>{rank <= 3 ? <span className="fw-medal" data-rank={rank} aria-hidden><Medal /></span> : null}#{rank}<small>of {total}</small></>}
              </strong>
              <span className="lt-sub">
                {rank === 0 ? "Buy something to get back in the table" : moved !== null ? <b data-tone={moved > 0 ? "up" : "down"}>{moved > 0 ? "▲" : "▼"} {describeMovement(moved)}</b> : rank === 1 ? "Leading the league" : `${total - rank} ${total - rank === 1 ? "player" : "players"} behind you`}
              </span>
            </div>
            <div className="lt-ret">
              <strong><Delta value={percent} size="lg" variant="plain" className="fw-delta" /></strong>
              <span className="lt-sub" data-tone={profit > 0 ? "up" : profit < 0 ? "down" : undefined}>
                {profit === 0 ? "Even with the start" : `${profit > 0 ? "+" : "−"}${formatCurrency(Math.abs(profit))} since start`}
              </span>
            </div>
          </div>
          <div className="lt-money">
            <span>
              Portfolio <b><HeadlineNumber id="fantasy-value" value={value} currency /></b>
            </span>
            <span>
              Cash <b><HeadlineNumber id="fantasy-cash" value={cash} currency /></b>
            </span>
            <span className="lt-pct">{investedPct >= 99.5 ? "All in picks" : `${Math.round(investedPct)}% in picks`}</span>
          </div>
          <SplitBar value={value} cash={cash} />
        </div>

        <div className="lt-week">
          {!season ? (
            <div className="fw-skeleton" style={{ height: 120 }} aria-hidden />
          ) : (
            <>
              <div className="lt-week-head">
                <div>
                  <span className="lt-k">
                    Weekly game
                    <InfoTip label="How weekly rounds work" text={`The long race keeps running. On top, each ${periodWord(season.season.cadence)} is a new round: everyone is ranked on that ${periodWord(season.season.cadence)}'s return. 1st earns one point per player, last earns one. Most points wins the season.`} />
                  </span>
                  <h2>{season.season.state === "complete" ? `Season ${season.season.number} done` : current ? <>Round {current.number}{season.season.roundCount ? <span> of {season.season.roundCount}</span> : null}</> : startsLabel(season.season.cadence, season.season.startsAt)}</h2>
                </div>
                {current ? (
                  <div className="lt-clock">
                    <strong><Countdown to={current.endsAt} /></strong>
                    <span>left</span>
                  </div>
                ) : null}
              </div>
              {current ? <WeekBar startsAt={current.startsAt} endsAt={current.endsAt} cadence={season.season.cadence} /> : null}
              <p className="lt-you">
                {mine ? <>You&apos;re <b>{ordinal(mine.rank)}</b> this round · <b>{formatPoints(mine.points)} {mine.points === 1 ? "pt" : "pts"}</b> if it ended now</> : `Trade as usual. Round 1 ranks this ${periodWord(season.season.cadence)}.`}
              </p>
              <div className="lt-foot">
                {top.length > 0 ? (
                  <div className="lt-chips" aria-label="Season leaders">
                    {top.map((s) => (
                      <span key={s.userId} className="fs-peek-chip" data-you={s.isYou || undefined}>
                        <Avatar src={s.image} name={s.name} handle={s.handle} size="sm" />
                        <em className="numeric">{formatPoints(s.points)}</em>
                      </span>
                    ))}
                    <small>Season {season.season.number}</small>
                  </div>
                ) : null}
                <Link href={`/fantasy/${leagueId}/season`} className="lt-open">
                  Season page <ArrowRight aria-hidden />
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {season ? (
        <>
          <button type="button" className="lt-toggle" aria-expanded={open} onClick={toggle}>
            <span>This round and season standings</span>
            <span className="fs-peek-toggle">{open ? "Hide" : "Show"} <ChevronDown aria-hidden /></span>
          </button>
          <div className="fs-card-fold" data-open={open || undefined}>
            <div className="fs-card-fold-in">
              <SeasonTables data={season} leagueId={leagueId} />
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}
