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

/** A cup with the round engraved on its plinth. Gold for wins, bigger with a star for a season title. */
export function Cup({ kind, label, title }: { kind: TrophyKind; label: string; title?: string }) {
  const big = kind === "season_champion" || kind === "perfect_season"
  const silver = kind === "season_runner_up" || kind === "season_third"
  const Icon = TROPHY_ICON[kind]
  const showIcon = kind !== "round_win" && !big
  return (
    <figure className="fs-cup" data-kind={kind} data-big={big || undefined} data-silver={silver || undefined} title={title}>
      <svg viewBox="0 0 48 56" aria-hidden>
        <defs>
          <linearGradient id={`cup-${kind}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={silver ? "#e8eaee" : "#ffe27a"} />
            <stop offset=".55" stopColor={silver ? "#9aa1ad" : "#d4a82a"} />
            <stop offset="1" stopColor={silver ? "#6b7280" : "#8a6414"} />
          </linearGradient>
        </defs>
        <path d="M12 6h24v14c0 8-5 13-12 13S12 28 12 20z" fill={`url(#cup-${kind})`} />
        <path d="M12 10H6c0 8 3 13 8 14M36 10h6c0 8-3 13-8 14" fill="none" stroke={`url(#cup-${kind})`} strokeWidth="3" strokeLinecap="round" />
        <rect x="21" y="33" width="6" height="8" fill={`url(#cup-${kind})`} />
        <rect x="14" y="41" width="20" height="6" rx="2" fill={`url(#cup-${kind})`} />
        <path d="M17 9v10" stroke="rgb(255 255 255 / .45)" strokeWidth="2" strokeLinecap="round" />
        {big ? <path d="M24 12l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" fill="#fff6cf" /> : <text x="24" y="25" textAnchor="middle" fontFamily="Georgia, serif" fontSize="13" fontWeight="700" fill="#4a3604">{label.replace(/^[RS]/, "")}</text>}
      </svg>
      {showIcon ? <span className="fs-cup-ic"><Icon aria-hidden /></span> : null}
      <figcaption>{label.startsWith("S") ? "Season" : "Round"}</figcaption>
    </figure>
  )
}
