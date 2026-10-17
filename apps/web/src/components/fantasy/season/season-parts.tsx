"use client"

import { useEffect, useState } from "react"
import { Crown, Flame, Medal, Sparkles, Trophy } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { Delta } from "@web/components/ui/delta"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import { formatCountdown, formatPoints } from "@web/components/fantasy/season/season-format"
import { NoteThread } from "@web/components/fantasy/season/note-thread"
import { formatPercent } from "@web/lib/format"
import { visibleReturn } from "@web/lib/return-display"
import { TROPHY_LABELS, type TrophyKind } from "@web/lib/fantasy-season"
import type { RoundRow, SeasonPerson } from "@web/lib/fantasy-season-view"

/** The current time, refreshed on an interval. Starts at the first client render so the server markup never differs. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

export function Countdown({ to }: { to: string }) {
  const now = useNow()
  return <>{formatCountdown(new Date(to).getTime() - now)}</>
}

export const personName = (p: Pick<SeasonPerson, "name" | "handle" | "isYou">) => (p.isYou ? "You" : (p.name ?? p.handle ?? "Member"))

const TROPHY_ICON: Record<TrophyKind, typeof Trophy> = {
  round_win: Trophy,
  hat_trick: Flame,
  season_champion: Crown,
  season_runner_up: Medal,
  season_third: Medal,
  perfect_season: Sparkles,
}

export function TrophyIcon({ kind }: { kind: TrophyKind }) {
  const Icon = TROPHY_ICON[kind] ?? Trophy
  return <Icon aria-hidden />
}

export function TrophyChip({ kind, detail }: { kind: TrophyKind; detail?: string }) {
  return (
    <li className="fs-trophy" data-kind={kind} title={TROPHY_LABELS[kind]?.detail}>
      <span className="fs-trophy-ic">
        <TrophyIcon kind={kind} />
      </span>
      <span>
        {TROPHY_LABELS[kind]?.label ?? kind}
        {detail ? <small> {detail}</small> : null}
      </span>
    </li>
  )
}

/**
 * A ranked list of people with the number the round is decided on. Picks, when a
 * round shows them, hang under each person as chips with their own return.
 */
export function PersonRows({ rows, showPoints = true, leagueId, onChanged }: { rows: RoundRow[]; showPoints?: boolean; leagueId?: string; onChanged?: () => void }) {
  return (
    <ul className="fs-rows">
      {rows.map((row) => {
        const sat = row.picked === false
        return (
          <li key={row.userId} className="fs-row" data-you={row.isYou || undefined}>
            <span className="fs-rank" data-rank={row.rank} aria-label={sat ? "Did not play" : `Rank ${row.rank}`}>
              {sat ? "–" : row.rank}
            </span>
            <Avatar src={row.image} name={row.name} handle={row.handle} size="md" />
            <div className="fs-who">
              <strong>
                <span>{personName(row)}</span>
                {row.isYou ? <span className="fw-you-tag">you</span> : null}
              </strong>
              <small>{row.handle ? `@${row.handle}` : " "}</small>
            </div>
            <div className="fs-figure">
              {sat ? (
                <span className="fs-sat">No picks</span>
              ) : (
                <>
                  <Delta value={row.percent} size="md" variant="plain" />
                  {showPoints ? <small>{formatPoints(row.points)} pts</small> : null}
                </>
              )}
            </div>
            {row.picks && row.picks.length > 0 ? (
              <div className="fs-picks">
                {row.picks.map((p) => {
                  const shown = p.percent === null ? null : visibleReturn(p.percent)
                  return (
                    <span key={p.id} className="fs-chip" title={p.name ?? p.ticker}>
                      <TickerLogo symbol={p.ticker} size="xs" className="rounded-full border-0 shadow-none" />
                      <b>{p.ticker}</b>
                      <em data-tone={shown === null ? undefined : shown > 0 ? "up" : shown < 0 ? "down" : undefined}>{p.percent === null ? "n/a" : formatPercent(p.percent, 2)}</em>
                    </span>
                  )
                })}
              </div>
            ) : null}
            {row.picks?.some((p) => p.note) && leagueId ? (
              <div style={{ gridColumn: "3 / -1" }}>
                {row.picks
                  .filter((p) => p.note)
                  .map((p) => (
                    <div key={p.id} style={{ paddingTop: 10 }}>
                      <span className="fs-sat">Why {p.ticker}</span>
                      <NoteThread leagueId={leagueId} note={p.note} onChanged={onChanged ?? (() => {})} />
                    </div>
                  ))}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
