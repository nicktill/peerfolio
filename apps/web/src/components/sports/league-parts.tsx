"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import { Check, Clock, Crown, Flame, Link2, Minus, Target, TrendingUp, Undo2, Wallet, X } from "lucide-react"
import { AnimatedNumber } from "@web/components/ui/animated-number"
import { LeagueMark } from "@web/components/league/league-mark"
import { EmptyScene } from "@web/components/ui/empty-scene"
import { InfoTip } from "@web/components/ui/tip"
import { Stat } from "@web/components/fantasy/balance-cards"
import { PlayerBadge, TeamBadge } from "@web/components/sports/team-badge"
import { toWin } from "@web/lib/sports/live/position"
import { eventTitle, formatCredits, formatOdds, marketTitle, openPickPhase, pickSentence, sideTeam, SPORT_LABEL, signedCredits, type DisplayMarket } from "@web/lib/sports/format"
import { marketSelectionColor } from "@web/lib/sports/matchup-colors"
import { Avatar, initialsFor } from "@web/components/ui/avatar"
import { LiveGameStrip } from "@web/components/sports/live-game"

export type EventInfo = { id?: string; sport: string; home: string; away: string; startsAt: string }
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
  you?: boolean
}
export type Standing = { name: string; credits: number; isYou: boolean; image?: string | null; record?: { won: number; lost: number } }

const credits = formatCredits
const signed = signedCredits
const hue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
const asMarket = (p: PickRow): DisplayMarket => ({ ...p.market, event: p.event })
const settled = (p: PickRow) => p.status === "won" || p.status === "lost"

/** Initials on a colour picked from the name, so players are recognisable at a glance. */
export function Badge({ name, size = 34, ring, image }: { name: string; size?: number; ring?: string; image?: string | null }) {
  return (
    <span className="sl-av" style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${hue(name)} 42% 34%)`, boxShadow: ring ? `0 0 0 2px var(--fw-panel), 0 0 0 3.5px ${ring}` : undefined }} aria-hidden>
      {image ? <Avatar src={image} name={name} className="h-full w-full border-0" /> : initialsFor(name, null)}
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
  // Standings count cash plus open stake, so compare like with like (not spendable cash).
  const mineStanding = standings.find((s) => s.isYou)
  const gap = leader && !leader.isYou ? leader.credits - (mineStanding?.credits ?? you.credits) : 0
  const delta = you.credits - league.startingCredits
  const mine = mineStanding?.record ?? statsByName(leaguePicks).get(mineStanding?.name ?? "")
  const decided = (mine?.won ?? 0) + (mine?.lost ?? 0)
  const hit = decided ? Math.round(((mine?.won ?? 0) / decided) * 100) : null

  return (
    <>
      <header className="fw-head reveal" data-accent={league.accent} aria-label="League">
        <div className="fw-identity">
          <span className="fw-art" data-accent={league.accent} aria-hidden>
            <LeagueMark value={league.emoji} accent={league.accent} size={42} />
          </span>
          <div>
            <span className="fw-eyebrow">Sports / Play money</span>
            <h1>{league.name}</h1>
          </div>
        </div>
        <ul className="fw-meta fw-meta-sports" aria-label="League rules">
          <li className="fw-meta-status">{status}</li>
          <li>
            {standings.length} {standings.length === 1 ? "player" : "players"}
          </li>
          {league.sports.map((s) => (
            <li key={s}>{SPORT_LABEL[s] ?? s}</li>
          ))}
        </ul>
        <div className="fw-actions">{invite}</div>
      </header>

      <dl className="fw-panel fw-scoreboard sp-scoreboard reveal" aria-label="League summary">
        <Stat label="Your rank" icon={<Crown />} tone="rank">
          <span className="fw-figure">
            #{rank}
            <small>of {standings.length}</small>
          </span>
          <span className="fw-sub">{rank === 1 ? "You're leading the league" : leader ? (gap > 0 ? `${credits(gap)} behind ${leader.name.split(" ")[0]}` : `Level with ${leader.name.split(" ")[0]}`) : ""}</span>
        </Stat>
        <Stat label={<>Cash <InfoTip text="Your play-money balance. Nothing real is at stake." label="About cash" /></>} icon={<Wallet />} tone="value">
          <span className="fw-figure numeric">
            <AnimatedNumber value={you.credits} format={credits} countUp={`sl-credits-${league.name}`} />
          </span>
          <span className="fw-sub" data-tone={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}>
            {delta === 0 ? "Even with the start" : <><b>{signed(delta)}</b> since the start</>}
          </span>
        </Stat>
        <Stat label={<>At risk <InfoTip text="Cash staked on picks that haven't settled yet." label="About at risk" /></>} icon={<Target />} tone="cash">
          <span className="fw-figure numeric">{credits(atRisk)}</span>
          <span className="fw-sub">{openCount === 0 ? "No open picks" : `${openCount} open ${openCount === 1 ? "pick" : "picks"}`}</span>
        </Stat>
        <Stat label="Your record" icon={<TrendingUp />} tone="return">
          <span className="fw-figure numeric">
            {mine?.won ?? 0}–{mine?.lost ?? 0}
          </span>
          <span className="fw-sub">{hit === null ? "No settled picks yet" : `${hit}% hit rate`}</span>
        </Stat>
      </dl>
    </>
  )
}

/** Credits as bars from a marked starting line, with form dots and record: who is winning, at a glance. */
export function Leaderboard({ standings: live, start, leaguePicks, demo }: { standings: Standing[]; start: number; leaguePicks: PickRow[]; demo?: boolean }) {
  // ?demo=ranks shuffles credits every few seconds so the rank animation can be seen without waiting for a real result.
  const [offsets, setOffsets] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!demo) return
    const id = setInterval(() => {
      const who = live[Math.floor(Math.random() * live.length)]
      if (who) setOffsets((o) => ({ ...o, [who.name]: (o[who.name] ?? 0) + Math.round((Math.random() - 0.45) * 160) }))
    }, 2600)
    return () => clearInterval(id)
  }, [demo, live])
  const standings = useMemo(() => (demo ? [...live].map((s) => ({ ...s, credits: s.credits + (offsets[s.name] ?? 0) })).sort((a, b) => b.credits - a.credits) : live), [demo, live, offsets])
  const stats = useMemo(() => statsByName(leaguePicks), [leaguePicks])
  // Equal distance from the centre always means equal profit or loss.
  const range = Math.max(start * 0.05, ...standings.map((s) => Math.abs(s.credits - start))) * 1.15 || 1
  const leader = standings[0]
  const second = standings[1]
  return (
    <>
      {leader && second && leader.credits > second.credits ? (
        <p className="sl-lead-note">
          <Crown aria-hidden /> <b>{leader.isYou ? "You lead" : `${leader.name} leads`}</b> by {credits(leader.credits - second.credits)}
        </p>
      ) : null}
      <ol className="sl-board">
        {standings.map((s, i) => {
          const st = stats.get(s.name)
          const record = s.record ?? st
          const roi = ((s.credits - start) / start) * 100
          const change = s.credits - start
          const tone = change > 0 ? "up" : change < 0 ? "down" : "flat"
          const width = Math.abs(change) / range * 50
          const ring = i === 0 ? "#d4af37" : i === 1 ? "#b8bcc4" : i === 2 ? "#b87333" : undefined
          return (
            <motion.li key={s.name} layout transition={{ type: "spring", stiffness: 420, damping: 38 }} className="sl-row" data-you={s.isYou || undefined} data-place={i + 1} data-pnl={tone} style={{ "--i": i } as React.CSSProperties}>
              <span className="sl-rank">
                {i === 0 ? (
                  <motion.span key="crown" className="sl-crown" initial={{ y: -22, opacity: 0, rotate: -25, scale: 0.6 }} animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 14 }}>
                    <Crown aria-hidden />
                  </motion.span>
                ) : (
                  <motion.span key={`n${i}`} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                    {i + 1}
                  </motion.span>
                )}
              </span>
              <Badge name={s.name} image={s.image} ring={ring} />
              <div className="sl-who">
                <div className="sl-who-top">
                  <b>{s.isYou ? "You" : s.name}</b>
                  <span className="sl-form" aria-label={st?.form.length ? `Last results: ${st.form.slice(-5).join(" ")}` : record && record.won + record.lost > 0 ? "No recent results in the public feed" : "No settled picks"}>
                    {(st?.form.slice(-5) ?? []).map((f, k) => (
                      <i key={k} data-r={f} />
                    ))}
                  </span>
                  <small>{record ? `${record.won}–${record.lost}` : "0–0"}</small>
                </div>
                <div className="sl-bar" aria-hidden>
                  <i data-tone={tone} style={{ left: `${change < 0 ? 50 - width : 50}%`, width: `${width}%`, transformOrigin: change < 0 ? "right" : "left" }} />
                  <u style={{ left: "50%" }} />
                </div>
              </div>
              <div className="sl-fig">
                <strong className="numeric">
                  <AnimatedNumber value={s.credits} format={credits} />
                </strong>
                <small data-tone={tone} className="numeric">
                  {signed(change)} · {" "}
                  {roi > 0 ? "+" : roi < 0 ? "−" : ""}
                  {Math.abs(roi).toFixed(1)}%
                </small>
              </div>
            </motion.li>
          )
        })}
      </ol>
      <p className="sl-board-note">Bars show gain or loss from {credits(start)} starting cash, including open stakes.</p>
    </>
  )
}

const RESULT: Record<string, { label: string; icon: React.ReactNode }> = {
  open: { label: "Open", icon: <Clock aria-hidden /> },
  won: { label: "Won", icon: <Check aria-hidden /> },
  lost: { label: "Lost", icon: <X aria-hidden /> },
  push: { label: "Push", icon: <Minus aria-hidden /> },
  void: { label: "Refunded", icon: <Undo2 aria-hidden /> },
}

/** One pick as a ticket: the team mark, the sentence, the price, and what it paid. */
const SEEN_KEY = "pf.sports.seenWins"

/** True the first time a won pick is shown in this browser (or always with ?demo=win), so the celebration plays once. */
function useFirstWin(id: string, won: boolean): boolean {
  const [first, setFirst] = useState(false)
  useEffect(() => {
    if (!won) return
    let demo = false
    try {
      demo = new URLSearchParams(window.location.search).get("demo") === "win"
      const seen = new Set<string>(JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]"))
      if (demo || !seen.has(id)) {
        setFirst(true)
        if (!demo) {
          seen.add(id)
          window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)))
        }
      }
    } catch {
      /* storage blocked: skip the celebration */
    }
  }, [id, won])
  return first
}

export function PickTicket({ pick, showName }: { pick: PickRow; showName?: boolean }) {
  const celebrate = useFirstWin(pick.id, pick.status === "won")
  const m = asMarket(pick)
  const base = RESULT[pick.status] ?? RESULT.open!
  // The clock only exists in the browser, so the first paint says "Open" and the real phase follows (no hydration mismatch).
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    if (pick.status !== "open") return
    setNow(new Date())
    const t = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [pick.status])
  const phase = pick.status === "open" && now ? openPickPhase(pick.event.startsAt, now) : null
  const r = phase ? { ...base, label: phase.label } : base
  const net = pick.payout == null ? null : pick.payout - pick.stake
  const side = sideTeam(pick.event, pick.market.kind, pick.selection)
  const color = side ? marketSelectionColor(pick.event, pick.market.kind, pick.selection) : undefined
  return (
    <li className="sl-ticket" data-status={pick.status} data-celebrate={celebrate || undefined} style={color ? ({ "--tc": color } as React.CSSProperties) : undefined}>
      <span className="sl-ticket-mark">{side ? <TeamBadge sport={pick.event.sport} name={side} size={36} /> : pick.market.player ? <PlayerBadge sport={pick.event.sport} name={pick.market.player} size={36} /> : <span className="sl-prop"><Target aria-hidden /></span>}</span>
      <div className="sl-ticket-body">
        <b>{pickSentence(m, pick)}</b>
        <span>
          {showName && pick.name ? <em>{pick.name.split(" ")[0]}{pick.you ? " (You)" : ""} · </em> : null}
          {eventTitle(pick.event)} · {marketTitle(m)}
        </span>
        <span className="numeric sl-ticket-money">
          <span>Risk <b>{credits(pick.stake)}</b></span>
          <i aria-hidden>·</i>
          {pick.payout == null ? (
            <span>To win <b>{credits(toWin(pick))}</b></span>
          ) : pick.payout > 0 ? (
            <span>Paid <b>{credits(pick.payout)}</b></span>
          ) : (
            <span>No payout</span>
          )}
          <em className="sl-price" title="Price accepted">{formatOdds(pick.price)}</em>
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
      {/* Only while the game is in progress. View only: the pick above keeps its accepted price and payout. */}
      <LiveGameStrip eventId={pick.event.id} sport={pick.event.sport} home={pick.event.home} away={pick.event.away} active={phase?.phase === "in_progress"} pick={pick.status === "open" ? { stake: pick.stake, totalReturn: pick.totalReturn, kind: pick.market.kind, selection: pick.selection } : undefined} />
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
  if (picks.length === 0) return <EmptyScene kind="picks" title="No picks yet" body={empty} />
  return (
    <>
      <div className="sl-feed-head">
        <div className="sl-tabs" role="tablist" aria-label="Filter picks">
          {(
            [
              ["all", `All ${picks.length}`],
              ["won", `Won ${won}`],
              ["lost", `Lost ${lost}`],
              ["open", `Open ${open}`],
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

/** The mark for a pick: the team it backs, the player it is on, or a target. */
function PickMark({ pick, size }: { pick: PickRow; size: number }) {
  const side = sideTeam(pick.event, pick.market.kind, pick.selection)
  if (side) return <TeamBadge sport={pick.event.sport} name={side} size={size} />
  if (pick.market.player) return <PlayerBadge sport={pick.event.sport} name={pick.market.player} size={size} />
  return <span className="sl-prop" style={{ width: size, height: size }}><Target aria-hidden /></span>
}

/** Quick league facts: hit rate ring, the biggest win, who is hottest, who is sharpest. Fills the rail with something useful. */
export function LeaguePulse({ leaguePicks }: { leaguePicks: PickRow[] }) {
  const done = leaguePicks.filter(settled)
  const wins = done.filter((p) => p.status === "won")
  const rate = done.length ? wins.length / done.length : 0
  const biggest = wins.reduce<PickRow | null>((b, p) => (b === null || (p.payout ?? 0) - p.stake > (b.payout ?? 0) - b.stake ? p : b), null)
  const stats = statsByName(leaguePicks)
  let hot: { name: string; streak: number } | null = null
  let sharp: { name: string; rate: number; n: number } | null = null
  for (const [name, st] of stats) {
    let streak = 0
    for (let i = st.form.length - 1; i >= 0 && st.form[i] === "W"; i--) streak++
    if (streak >= 2 && (!hot || streak > hot.streak)) hot = { name, streak }
    const n = st.won + st.lost
    if (n >= 2 && (!sharp || st.won / n > sharp.rate)) sharp = { name, rate: st.won / n, n }
  }
  const R = 40
  const C = 2 * Math.PI * R
  return (
    <section className="fw-panel sl-pulse reveal" aria-label="League pulse">
      <div className="fw-section-head">
        <h2>League pulse</h2>
        <p>{done.length} settled picks</p>
      </div>
      <div className="sl-pulse-body">
        <div className="sl-ring">
          <svg viewBox="0 0 100 100" aria-hidden>
            <defs>
              <linearGradient id="sl-ring-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--lg, #3fae7f)" />
                <stop offset="1" stopColor="#f6d768" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r={R} className="sl-ring-bg" />
            <circle cx="50" cy="50" r={R} className="sl-ring-ticks" />
            <circle cx="50" cy="50" r={R} className="sl-ring-fg" strokeDasharray={`${C * rate} ${C}`} />
          </svg>
          <div className="sl-ring-label">
            <strong className="numeric">{done.length ? Math.round(rate * 100) : "–"}<small>%</small></strong>
            <span>picks won</span>
          </div>
        </div>
        <ul>
          <li>
            {biggest ? <PickMark pick={biggest} size={40} /> : <span className="sl-pulse-ic"><TrendingUp aria-hidden /></span>}
            <div>
              <small>Biggest win</small>
              <b>{biggest ? <>{biggest.name?.split(" ")[0]} <span className="sl-gold">+{credits((biggest.payout ?? 0) - biggest.stake)}</span></> : "None yet"}</b>
              {biggest ? <em>{pickSentence(asMarket(biggest), biggest)}</em> : <em>The first big win lands here</em>}
            </div>
          </li>
          <li data-hot={hot ? "" : undefined}>
            <span className="sl-pulse-ic" data-hot><Flame aria-hidden /></span>
            <div>
              <small>Hottest</small>
              <b>{hot ? `${hot.name.split(" ")[0]} · ${hot.streak} straight` : "Nobody on a streak"}</b>
              {hot ? (
                <em className="sl-dots" aria-hidden>
                  {Array.from({ length: Math.min(hot.streak, 8) }, (_, i) => <i key={i} style={{ "--d": i } as React.CSSProperties} />)}
                </em>
              ) : (
                <em>Win two in a row to show up</em>
              )}
            </div>
          </li>
          <li>
            {sharp ? <Badge name={sharp.name} size={40} ring="#d4af37" /> : <span className="sl-pulse-ic"><Target aria-hidden /></span>}
            <div>
              <small>Sharpest</small>
              <b>{sharp ? `${sharp.name.split(" ")[0]} · ${Math.round(sharp.rate * 100)}%` : "Too early to tell"}</b>
              <em>{sharp ? `${sharp.n} settled picks` : "Needs two settled picks"}</em>
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

/** The next games with an unsettled pick, from the league response already on screen. */
export function NextGames({ picks, events }: { picks: PickRow[]; events: EventInfo[] }) {
  const keyOf = (event: EventInfo) => `${event.sport}:${event.home}:${event.away}:${event.startsAt}`
  const picked = new Set(picks.filter((p) => p.status === "open").map((p) => keyOf(p.event)))
  const unique = new Map<string, EventInfo>()
  for (const event of [...events, ...picks.filter((p) => p.status === "open").map((p) => p.event)]) unique.set(keyOf(event), event)
  const all = [...unique.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 25)
  const [expanded, setExpanded] = useState(false)
  const games = expanded ? all : all.slice(0, 5)
  return <section className="fw-panel sp-next sp-desktop-context" aria-labelledby="sp-next-title">
    <div className="fw-section-head"><h2 id="sp-next-title">Upcoming games</h2><Clock size={14} aria-hidden /></div>
    {games.length ? <ul>{games.map((event) => <li key={keyOf(event)}>
      <div className="sp-next-teams"><TeamBadge sport={event.sport} name={event.away} size={24} /><TeamBadge sport={event.sport} name={event.home} size={24} /></div>
      <div><span className="sp-next-sport">{SPORT_LABEL[event.sport] ?? event.sport}{picked.has(keyOf(event)) ? " · You have a pick" : ""}</span><b>{event.away} {event.sport === "tennis" ? "vs" : "@"} {event.home}</b><span>{openPickPhase(event.startsAt, new Date()).label}</span></div>
    </li>)}</ul> : <p className="fw-empty">Upcoming matchups will appear when lines are posted.</p>}
    {all.length > 5 ? <button type="button" className="fw-link sp-next-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer" : `Show ${all.length - 5} more`}</button> : null}
  </section>
}
