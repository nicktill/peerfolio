"use client"

import { useMemo, useState } from "react"
import { Check, Clock, Crown, Flame, Link2, Minus, Target, TrendingUp, Undo2, X } from "lucide-react"
import { AnimatedNumber } from "@web/components/ui/animated-number"
import { LeagueBackdrop, LeagueMark, watermark } from "@web/components/league/league-mark"
import { InfoTip } from "@web/components/ui/tip"
import { PlayerBadge, TeamBadge } from "@web/components/sports/team-badge"
import { eventTitle, formatOdds, marketTitle, pickSentence, SPORT_LABEL, type DisplayMarket } from "@web/lib/sports/format"
import { teamLook } from "@web/lib/sports/teams"
import { initialsFor } from "@web/components/ui/avatar"

export type EventInfo = { sport: string; home: string; away: string; startsAt: string }
export type PickRow = {
  id: string
  selection: string
  stake: number
  price: number
  point: number | null
  totalReturn: number
  payout: number | null
  status: string
  acceptedAt: string
  market: { kind: string; player: string | null; statKey: string | null }
  event: EventInfo
  name?: string
}
export type Standing = { name: string; credits: number; isYou: boolean }

const credits = (n: number) => Math.round(n).toLocaleString()
const signed = (n: number) => (n > 0 ? `+${credits(n)}` : n < 0 ? `−${credits(-n)}` : "0")
const hue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
const asMarket = (p: PickRow): DisplayMarket => ({ ...p.market, event: p.event })
const settled = (p: PickRow) => p.status === "won" || p.status === "lost"

/** Initials on a colour picked from the name, so players are recognisable at a glance. */
export function Badge({ name, size = 34, ring }: { name: string; size?: number; ring?: string }) {
  return (
    <span className="sl-av" style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${hue(name)} 42% 34%)`, boxShadow: ring ? `0 0 0 2px var(--fw-panel), 0 0 0 3.5px ${ring}` : undefined }} aria-hidden>
      {initialsFor(name, null)}
    </span>
  )
}

type Stats = { won: number; lost: number; open: number; net: number; form: string[] }

/** Everyone's record, from the picks that are public once their market has locked. */
function statsByName(leaguePicks: PickRow[]): Map<string, Stats> {
  const out = new Map<string, Stats>()
  const sorted = [...leaguePicks].sort((a, b) => new Date(a.acceptedAt).getTime() - new Date(b.acceptedAt).getTime())
  for (const p of sorted) {
    const name = p.name ?? ""
    const s = out.get(name) ?? { won: 0, lost: 0, open: 0, net: 0, form: [] }
    if (p.status === "won") s.won++
    else if (p.status === "lost") s.lost++
    else if (p.status === "open") s.open++
    if (p.payout != null) s.net += p.payout - p.stake
    if (settled(p)) s.form.push(p.status === "won" ? "W" : "L")
    out.set(name, s)
  }
  return out
}

export function LeagueHero({
  league,
  standings,
  you,
  atRisk,
  openCount,
  leaguePicks,
  status,
  invite,
}: {
  league: { name: string; emoji: string; accent: string; sports: string[]; startingCredits: number }
  standings: Standing[]
  you: { credits: number }
  atRisk: number
  openCount: number
  leaguePicks: PickRow[]
  status: string
  invite: React.ReactNode
}) {
  const rank = standings.findIndex((s) => s.isYou) + 1
  const leader = standings[0]
  const gap = leader && !leader.isYou ? leader.credits - you.credits : 0
  const delta = you.credits - league.startingCredits
  const mine = statsByName(leaguePicks).get(standings.find((s) => s.isYou)?.name ?? "")
  const decided = (mine?.won ?? 0) + (mine?.lost ?? 0)
  const hit = decided ? Math.round(((mine?.won ?? 0) / decided) * 100) : null

  return (
    <section className="sl-hero reveal" data-emoji={watermark(league.emoji)} aria-label="League summary">
      <LeagueBackdrop value={league.emoji} />
      <div className="sl-hero-top">
        <span className="sl-hero-art" aria-hidden>
          <LeagueMark value={league.emoji} accent={league.accent} size={48} />
        </span>
        <div className="sl-hero-id">
          <span className="sl-kicker">
            <i aria-hidden /> Sports league · play credits
          </span>
          <h1>{league.name}</h1>
          <p>
            {status} · {standings.length} players · {league.sports.map((s) => SPORT_LABEL[s] ?? s).join(" · ")}
          </p>
        </div>
        <div className="sl-hero-invite">{invite}</div>
      </div>

      <div className="sl-stats">
        <div className="sl-stat" data-hero>
          <span className="sl-stat-k">Your rank</span>
          <strong>
            #{rank}
            <small> of {standings.length}</small>
          </strong>
          <span className="sl-stat-n">{rank === 1 ? "You're leading the league" : leader ? `${credits(gap)} behind ${leader.name.split(" ")[0]}` : ""}</span>
        </div>
        <div className="sl-stat">
          <span className="sl-stat-k">
            Credits <InfoTip text="Your balance of play credits. Nothing real is at stake." label="About credits" />
          </span>
          <strong className="numeric">
            <AnimatedNumber value={you.credits} format={credits} countUp={`sl-credits-${league.name}`} />
          </strong>
          <span className="sl-stat-n" data-tone={delta > 0 ? "up" : delta < 0 ? "down" : undefined}>
            {delta === 0 ? "Even with the start" : `${signed(delta)} since the start`}
          </span>
        </div>
        <div className="sl-stat">
          <span className="sl-stat-k">
            At risk <InfoTip text="Credits staked on picks that haven't settled yet." label="About at risk" />
          </span>
          <strong className="numeric">{credits(atRisk)}</strong>
          <span className="sl-stat-n">{openCount === 0 ? "No open picks" : `${openCount} open ${openCount === 1 ? "pick" : "picks"}`}</span>
        </div>
        <div className="sl-stat">
          <span className="sl-stat-k">Your record</span>
          <strong className="numeric">
            {mine?.won ?? 0}–{mine?.lost ?? 0}
          </strong>
          <span className="sl-stat-n">{hit === null ? "No settled picks yet" : `${hit}% hit rate`}</span>
        </div>
      </div>
    </section>
  )
}

/** Credits as bars from a marked starting line, with form dots and record: who is winning, at a glance. */
export function Leaderboard({ standings, start, leaguePicks }: { standings: Standing[]; start: number; leaguePicks: PickRow[] }) {
  const stats = useMemo(() => statsByName(leaguePicks), [leaguePicks])
  const max = Math.max(start * 1.15, ...standings.map((s) => s.credits))
  const min = Math.min(start * 0.85, ...standings.map((s) => s.credits))
  const span = max - min || 1
  const baseline = ((start - min) / span) * 100
  const leader = standings[0]
  const second = standings[1]
  return (
    <>
      {leader && second ? (
        <p className="sl-lead-note">
          <Crown aria-hidden /> <b>{leader.isYou ? "You lead" : `${leader.name} leads`}</b> by {credits(leader.credits - second.credits)} credits
        </p>
      ) : null}
      <ol className="sl-board">
        {standings.map((s, i) => {
          const st = stats.get(s.name)
          const roi = ((s.credits - start) / start) * 100
          const pct = ((s.credits - min) / span) * 100
          const ring = i === 0 ? "#d4af37" : i === 1 ? "#b8bcc4" : i === 2 ? "#b87333" : undefined
          return (
            <li key={`${s.name}-${i}`} className="sl-row" data-you={s.isYou || undefined} data-place={i + 1} style={{ "--i": i } as React.CSSProperties}>
              <span className="sl-rank">{i === 0 ? <Crown aria-hidden /> : i + 1}</span>
              <Badge name={s.name} ring={ring} />
              <div className="sl-who">
                <div className="sl-who-top">
                  <b>{s.isYou ? "You" : s.name}</b>
                  <span className="sl-form" aria-label={st?.form.length ? `Last results: ${st.form.slice(-5).join(" ")}` : "No settled picks"}>
                    {(st?.form.slice(-5) ?? []).map((f, k) => (
                      <i key={k} data-r={f} />
                    ))}
                  </span>
                  <small>{st ? `${st.won}–${st.lost}` : "0–0"}</small>
                </div>
                <div className="sl-bar" aria-hidden>
                  <i style={{ width: `${Math.max(pct, 3)}%` }} />
                  <u style={{ left: `${baseline}%` }} />
                </div>
              </div>
              <div className="sl-fig">
                <strong className="numeric">{credits(s.credits)}</strong>
                <small data-tone={roi > 0.05 ? "up" : roi < -0.05 ? "down" : undefined} className="numeric">
                  {roi > 0 ? "+" : roi < 0 ? "−" : ""}
                  {Math.abs(roi).toFixed(1)}%
                </small>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="sl-board-note">The tick on each bar is where everyone started ({credits(start)}).</p>
    </>
  )
}

const RESULT: Record<string, { label: string; icon: React.ReactNode }> = {
  open: { label: "Live", icon: <Clock aria-hidden /> },
  won: { label: "Won", icon: <Check aria-hidden /> },
  lost: { label: "Lost", icon: <X aria-hidden /> },
  push: { label: "Push", icon: <Minus aria-hidden /> },
  void: { label: "Refunded", icon: <Undo2 aria-hidden /> },
}

/** One pick as a ticket: the team mark, the sentence, the price, and what it paid. */
export function PickTicket({ pick, showName }: { pick: PickRow; showName?: boolean }) {
  const m = asMarket(pick)
  const r = RESULT[pick.status] ?? RESULT.open!
  const net = pick.payout == null ? null : pick.payout - pick.stake
  const side = pick.market.kind === "moneyline" || pick.market.kind === "spread" ? (pick.selection === "home" ? pick.event.home : pick.event.away) : null
  const color = side ? teamLook(pick.event.sport, side).color : undefined
  return (
    <li className="sl-ticket" data-status={pick.status} style={color ? ({ "--tc": color } as React.CSSProperties) : undefined}>
      <span className="sl-ticket-mark">{side ? <TeamBadge sport={pick.event.sport} name={side} size={36} /> : pick.market.player ? <PlayerBadge sport={pick.event.sport} name={pick.market.player} size={36} /> : <span className="sl-prop"><Target aria-hidden /></span>}</span>
      <div className="sl-ticket-body">
        <b>{pickSentence(m, pick)}</b>
        <span>
          {showName && pick.name ? <em>{pick.name.split(" ")[0]} · </em> : null}
          {eventTitle(pick.event)} · {marketTitle(m)}
        </span>
        <span className="numeric sl-ticket-money">
          {credits(pick.stake)} at {formatOdds(pick.price)} → {pick.payout == null ? `${credits(pick.totalReturn)} if it wins` : `paid ${credits(pick.payout)}`}
        </span>
      </div>
      <div className="sl-ticket-side">
        <span className="sl-chip" data-status={pick.status}>
          {r.icon}
          {r.label}
        </span>
        {net != null && pick.status !== "open" ? (
          <strong className="numeric" data-tone={net > 0 ? "up" : net < 0 ? "down" : undefined}>
            {signed(net)}
          </strong>
        ) : null}
      </div>
    </li>
  )
}

/** Locked picks with a result filter and a hit-rate summary above the tickets. */
export function PickFeed({ picks, empty, showName }: { picks: PickRow[]; empty: string; showName?: boolean }) {
  const [filter, setFilter] = useState<"all" | "won" | "lost" | "open">("all")
  const won = picks.filter((p) => p.status === "won").length
  const lost = picks.filter((p) => p.status === "lost").length
  const open = picks.filter((p) => p.status === "open").length
  const shown = filter === "all" ? picks : picks.filter((p) => p.status === filter)
  if (picks.length === 0) return <p className="fw-empty">{empty}</p>
  return (
    <>
      <div className="sl-feed-head">
        <div className="sl-tabs" role="tablist" aria-label="Filter picks">
          {(
            [
              ["all", `All ${picks.length}`],
              ["won", `Won ${won}`],
              ["lost", `Lost ${lost}`],
              ["open", `Live ${open}`],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
        {won + lost > 0 ? (
          <span className="sl-hit" title="Share of settled picks that won">
            <TrendingUp aria-hidden /> {Math.round((won / (won + lost)) * 100)}% hit rate
          </span>
        ) : null}
      </div>
      <ul className="sl-tickets" key={filter}>
        {shown.length === 0 ? <li className="fw-empty">Nothing here yet.</li> : shown.map((p) => <PickTicket key={p.id} pick={p} showName={showName} />)}
      </ul>
    </>
  )
}

/** Quick league facts: hit rate ring, the biggest win, who is hottest. Fills the rail with something useful. */
export function LeaguePulse({ leaguePicks }: { leaguePicks: PickRow[] }) {
  const done = leaguePicks.filter(settled)
  const wins = done.filter((p) => p.status === "won")
  const rate = done.length ? wins.length / done.length : 0
  const biggest = wins.reduce<PickRow | null>((b, p) => (b === null || (p.payout ?? 0) - p.stake > (b.payout ?? 0) - b.stake ? p : b), null)
  const stats = statsByName(leaguePicks)
  let hot: { name: string; streak: number } | null = null
  for (const [name, s] of stats) {
    let streak = 0
    for (let i = s.form.length - 1; i >= 0 && s.form[i] === "W"; i--) streak++
    if (streak >= 2 && (!hot || streak > hot.streak)) hot = { name, streak }
  }
  const C = 2 * Math.PI * 26
  return (
    <section className="fw-panel sl-pulse reveal" aria-label="League pulse">
      <div className="fw-section-head">
        <h2>League pulse</h2>
        <p>{done.length} settled picks</p>
      </div>
      <div className="sl-pulse-body">
        <div className="sl-ring">
          <svg viewBox="0 0 64 64" aria-hidden>
            <circle cx="32" cy="32" r="26" className="sl-ring-bg" />
            <circle cx="32" cy="32" r="26" className="sl-ring-fg" strokeDasharray={`${C * rate} ${C}`} />
          </svg>
          <strong className="numeric">{done.length ? Math.round(rate * 100) : "–"}<small>%</small></strong>
          <span>Picks won</span>
        </div>
        <ul>
          <li>
            <span className="sl-pulse-ic"><TrendingUp aria-hidden /></span>
            <div>
              <small>Biggest win</small>
              <b>{biggest ? `${biggest.name?.split(" ")[0] ?? ""} +${credits((biggest.payout ?? 0) - biggest.stake)}` : "None yet"}</b>
              {biggest ? <em>{pickSentence(asMarket(biggest), biggest)}</em> : null}
            </div>
          </li>
          <li>
            <span className="sl-pulse-ic" data-hot><Flame aria-hidden /></span>
            <div>
              <small>Hottest</small>
              <b>{hot ? `${hot.name.split(" ")[0]} · ${hot.streak} straight` : "Nobody on a streak"}</b>
              {hot ? <em>Wins in a row</em> : <em>Win two in a row to show up</em>}
            </div>
          </li>
        </ul>
      </div>
    </section>
  )
}

export function InviteChip({ code, copied, onCopy }: { code: string; copied: boolean; onCopy: () => void }) {
  return (
    <button type="button" className="fw-btn" data-solid onClick={onCopy}>
      {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      {copied ? "Code copied" : `Invite code ${code}`}
    </button>
  )
}
