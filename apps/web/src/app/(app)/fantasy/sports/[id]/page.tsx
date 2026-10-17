"use client"

import "@web/components/fantasy/fantasy-workspace.css"
import "@web/components/sports/sports-workspace.css"

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, Link2, Lock, X } from "lucide-react"
import { Choice } from "@web/components/fantasy/choice"
import { timeLeft } from "@web/components/fantasy/time-left"
import { revealStyle } from "@web/components/motion/reveal"
import { LeaguePageSkeleton } from "@web/components/skeletons"
import { useToast } from "@web/components/ui/toast"
import { useFantasyMode } from "@web/components/sports/mode-switch"
import { eventTitle, formatOdds, lineLabel, lockLabel, marketTitle, pickSentence, SPORT_LABEL, winOn100, type DisplayLine, type DisplayMarket } from "@web/lib/sports/format"
import { americanToDecimal } from "@web/lib/sports/odds"
import { onColor, teamLook } from "@web/lib/sports/teams"
import { InfoTip, Tip } from "@web/components/ui/tip"
import { LeagueHero, LeaguePulse, Leaderboard, NextGames, PickFeed } from "@web/components/sports/league-parts"
import { PickLockEffect, type PickLockFx } from "@web/components/sports/pick-lock-effect"
import { PlayerBadge, TeamBadge } from "@web/components/sports/team-badge"
import { plural } from "@web/lib/plural"
import { mutate, useApi } from "@web/lib/use-api"

type Line = DisplayLine & { id: string; price: number }
type EventInfo = { sport: string; home: string; away: string; startsAt: string }
type Market = DisplayMarket & {
  id: string
  lockAt: string
  picked: { selection: string; stake: number } | null
  event: EventInfo
  lines: Line[]
}
type PickRow = {
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
}
type Detail = {
  league: { id: string; name: string; emoji: string; accent: string; sports: string[]; inviteCode: string; startingCredits: number; endsAt: string | null; isOwner: boolean }
  you: { credits: number }
  limits: { minStake: number; maxStake: number; maxOpenPicks: number }
  standings: { name: string; credits: number; isYou: boolean }[]
  markets: Market[]
  picks: PickRow[]
  leaguePicks: (PickRow & { name: string })[]
}

/** The freshly fetched market and line for what the user selected (same ids; the line row is updated in place on a reprice). */
function resolveSelected(markets: Market[], sel: { market: Market; line: Line }): { market: Market; line: Line } | null {
  const market = markets.find((m) => m.id === sel.market.id)
  const line = market?.lines.find((l) => l.id === sel.line.id)
  return market && line ? { market, line } : null
}

const SPORT_COLOR: Record<string, string> = { nfl: "#c8102e", nba: "#f58426", tennis: "#a6c738" }
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
const credits = (n: number) => n.toLocaleString()

export default function SportsLeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [, , visit] = useFantasyMode()
  // Landing here means Sports is the side you're on; "Fantasy leagues" then returns to it.
  useEffect(() => visit("sports"), [visit])

  const { data, error, loading, refetch } = useApi<Detail>(`/api/sports/leagues/${id}`, [], { refreshMs: 20_000 })
  const [selected, setSelected] = useState<{ market: Market; line: Line } | null>(null)
  const [sport, setSport] = useState<string>("all")
  const [demo, setDemo] = useState<string | null>(null)
  useEffect(() => setDemo(new URLSearchParams(window.location.search).get("demo")), [])
  const [lockFx, setLockFx] = useState<PickLockFx | null>(null)
  const clearLockFx = useCallback(() => setLockFx(null), [])
  // ?demo=lock replays the lock-in animation every few seconds without placing a pick.
  useEffect(() => {
    if (demo !== "lock") return
    const play = () => setLockFx({ id: Date.now(), color: "#c8102e", ink: "#ffffff", title: "Chiefs -3.5", sub: "250 at -110 · to win 227", odds: "-110", from: 1000, to: 750 })
    const first = setTimeout(play, 600)
    const every = setInterval(play, 4000)
    return () => { clearTimeout(first); clearInterval(every) }
  }, [demo])

  if (loading && !data) return <LeaguePageSkeleton />
  if (!data) return <p className="text-sm text-muted-foreground">{error ?? "Couldn't load this league."}</p>

  const { league, you, standings, markets, picks, leaguePicks } = data
  // Prices can be refreshed until kickoff, so the slip always shows the price from the latest fetch. A line or market that has
  // since closed drops out and the slip clears; the price you are shown is the price sent, and the server refuses a stale one.
  const current = selected ? resolveSelected(markets, selected) : null
  const atRisk = picks.filter((p) => p.status === "open").reduce((sum, p) => sum + p.stake, 0)
  const ended = !!league.endsAt && new Date(league.endsAt).getTime() < Date.now()
  const status = ended ? "Final standings" : league.endsAt ? timeLeft(league.endsAt) : "No end"
  const shown = sport === "all" ? markets : markets.filter((m) => m.event.sport === sport)

  return (
    <div className="fw fw-play-space" data-play-world="sports" data-accent={league.accent}>
      <Link href="/fantasy" className="fw-back">
        <ArrowLeft className="size-3.5" aria-hidden /> Fantasy leagues
      </Link>

      <LeagueHero
        league={league}
        standings={standings}
        you={you}
        atRisk={atRisk}
        openCount={picks.filter((p) => p.status === "open").length}
        leaguePicks={leaguePicks}
        status={status}
        invite={<InviteButton code={league.inviteCode} />}
      />

      <div className="fw-grid">
        <div className="fw-main">
          <section className="fw-panel reveal" style={revealStyle(2)} aria-labelledby="sp-markets-title">
            <div className="fw-section-head">
              <h2 id="sp-markets-title">Open lines<InfoTip side="bottom" label="How lines work" text={<>Everyone gets the same line, and it can update until kickoff. Once you lock a pick, your price never changes. <b>+125</b> means 100 cash wins 125. <b>-110</b> means risking 110 wins 100. On a <b>spread</b>, your team must win by more than the number (or lose by less).</>} /></h2>
              <p>Prices refresh until kickoff</p>
            </div>
            {league.sports.length > 1 ? (
              <div className="sp-filter fw-choices" role="group" aria-label="Filter by sport">
                <Choice active={sport === "all"} onClick={() => setSport("all")}>
                  All
                </Choice>
                {league.sports.map((s) => (
                  <Choice key={s} active={sport === s} onClick={() => setSport(s)}>
                    {SPORT_LABEL[s] ?? s}
                  </Choice>
                ))}
              </div>
            ) : null}
            <Markets markets={shown} selected={current} onSelect={(market, line) => setSelected({ market, line })} disabled={ended} />
          </section>

          <section className="fw-panel reveal" style={revealStyle(3)} aria-labelledby="sp-standings-title">
            <div className="fw-section-head">
              <h2 id="sp-standings-title">Leaderboard</h2>
              <p>Cash, form and record</p>
            </div>
            <Leaderboard standings={standings} start={league.startingCredits} leaguePicks={leaguePicks} demo={demo === "ranks"} />
          </section>


        </div>

        <aside className="fw-rail sp-sports-rail reveal" style={revealStyle(3)}>
          <PickLockEffect fx={lockFx} onDone={clearLockFx} />
          <Slip
            leagueId={league.id}
            selected={current}
            onStale={() => void refetch()}
            balance={you.credits}
            limits={data.limits}
            closed={ended}
            onClear={() => setSelected(null)}
            onLock={setLockFx}
            onPlaced={() => {
              setSelected(null)
              void refetch()
            }}
          />
          <section className="fw-panel reveal" style={revealStyle(4)} aria-labelledby="sp-yours-title">
            <div className="fw-section-head">
              <h2 id="sp-yours-title">Your picks</h2>
              <p>{picks.length === 0 ? "None yet" : plural(picks.length, "pick")}</p>
            </div>
            <PickFeed picks={picks} empty="Nothing yet. Cash doesn't win leagues." />
          </section>
          <div className="sp-desktop-context"><LeaguePulse leaguePicks={leaguePicks} /></div>
          <NextGames picks={picks} events={markets.map((market) => market.event)} />
        </aside>
      </div>
          <section className="fw-panel reveal" data-flat style={revealStyle(4)} aria-labelledby="sp-locked-title">
            <div className="fw-section-head">
              <h2 id="sp-locked-title">Locked picks</h2>
              <p>Everyone&apos;s picks, once the market closes</p>
            </div>
            <PickFeed picks={leaguePicks} showName empty="Picks show up here after each market locks, never before." />
          </section>
      {league.isOwner ? <MirrorReport leagueId={league.id} /> : null}
      {/* Keeps the last rows clear of the phone pick sheet. */}
      <div className="sp-sheet-spacer" data-on={selected ? "" : undefined} aria-hidden />
    </div>
  )
}

function InviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="fw-btn fw-invite"
      aria-label={copied ? "Code copied" : `Copy invite code ${code}`}
      data-solid
      onClick={() => {
        void navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      <span className="fw-invite-label-full">{copied ? "Code copied" : `Invite code ${code}`}</span>
      <span className="fw-invite-label-short">{copied ? "Copied" : "Invite"}</span>
    </button>
  )
}

function Markets({ markets, selected, onSelect, disabled }: { markets: Market[]; selected: { line: Line } | null; onSelect: (m: Market, l: Line) => void; disabled: boolean }) {
  // Group by game, then by day, in kickoff order (the API already sorts by start).
  const games = useMemo(() => {
    const byEvent = new Map<string, { key: string; event: EventInfo; markets: Market[] }>()
    for (const m of markets) {
      const key = `${m.event.sport}|${m.event.home}|${m.event.away}|${m.event.startsAt}`
      const g = byEvent.get(key) ?? { key, event: m.event, markets: [] }
      g.markets.push(m)
      byEvent.set(key, g)
    }
    return [...byEvent.values()]
  }, [markets])

  if (games.length === 0) return <p className="fw-empty">No open lines right now. Games post about a day ahead.</p>

  let lastDay = ""
  return (
    <ul className="sp-events">
      {games.map((g) => {
        const day = dayOf(g.event.startsAt)
        const heading = day !== lastDay ? day : null
        lastDay = day
        return (
          <li key={g.key}>
            {heading ? <h3 className="sp-day">{heading}</h3> : null}
            <GameCard game={g} selected={selected} onSelect={onSelect} disabled={disabled} />
          </li>
        )
      })}
    </ul>
  )
}

function Slip({
  leagueId,
  selected,
  balance,
  limits,
  closed,
  onClear,
  onLock,
  onPlaced,
  onStale,
}: {
  leagueId: string
  selected: { market: Market; line: Line } | null
  onStale: () => void
  balance: number
  limits: Detail["limits"]
  closed: boolean
  onClear: () => void
  onLock: (fx: PickLockFx) => void
  onPlaced: () => void
}) {
  const { toast } = useToast()
  const [stake, setStake] = useState("")
  const [dragY, setDragY] = useState(0)
  const dragStart = useRef<number | null>(null)
  const dragged = useRef(false)
  const [pending, setPending] = useState(false)
  // Tell the user when the price under their finger changed since they opened the slip.
  const openedAt = useRef<{ id: string; price: number } | null>(null)
  if (selected && openedAt.current?.id !== selected.line.id) openedAt.current = { id: selected.line.id, price: selected.line.price }
  const moved = selected && openedAt.current && openedAt.current.id === selected.line.id && openedAt.current.price !== selected.line.price ? openedAt.current.price : null
  // One key per slip: a double tap or a retry after a dropped response places a single pick.
  const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
  const [requestId, setRequestId] = useState(newKey)
  // A different line is a different pick: a fresh stake and idempotency key, but the slip itself stays mounted (no reload flash).
  const lineId = selected?.line.id
  useEffect(() => {
    setStake("")
    setDragY(0)
    setRequestId(newKey())
  }, [lineId])

  const cap = Math.min(limits.maxStake, balance)
  const amount = Math.floor(Number(stake.replace(/[^\d]/g, "")) || 0)
  const winnings = selected ? Math.floor(amount * americanToDecimal(selected.line.price)) - amount : 0
  const slipSide = selected && (selected.market.kind === "moneyline" || selected.market.kind === "spread") ? (selected.line.selection === "home" ? selected.market.event.home : selected.market.event.away) : null
  // The slip wears the colour of what you picked: the team, or the sport for totals and props.
  const slipColor = selected ? (slipSide ? teamLook(selected.market.event.sport, slipSide).color : SPORT_COLOR[selected.market.event.sport] ?? "#64748b") : null
  const problem =
    amount === 0 ? null : amount < limits.minStake ? `Minimum is ${limits.minStake}` : amount > limits.maxStake ? `Maximum per pick is ${credits(limits.maxStake)}` : amount > balance ? "Not enough cash" : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || amount === 0 || problem) return
    setPending(true)
    try {
      await mutate(`/api/sports/leagues/${leagueId}/picks`, {
        body: { lineId: selected.line.id, stake: amount, expectedPrice: selected.line.price, expectedPoint: selected.line.point, requestId },
      })
      onLock({ id: Date.now(), color: slipColor ?? "#64748b", ink: onColor(slipColor ?? "#64748b"), title: pickSentence(selected.market, selected.line), sub: `${credits(amount)} at ${formatOdds(selected.line.price)} · to win ${credits(winnings)}`, odds: formatOdds(selected.line.price), from: balance, to: balance - amount, big: selected.line.price >= 200 })
      toast("Pick locked in.", "success")
      onPlaced()
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't place that pick."
      toast(message, "error")
      // A moved line: pull the new price so the slip shows it, and let the user decide again.
      if (/line moved|line changed/i.test(message)) onStale()
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="fw-panel fw-trade sp-slip sp-sheet reveal" style={{ ...revealStyle(3), "--sheet-drag": `${dragY}px`, ...(slipColor ? ({ "--tc": slipColor, "--tc-ink": onColor(slipColor) } as React.CSSProperties) : null) } as React.CSSProperties} aria-labelledby="sp-slip-title" data-dragging={dragStart.current != null || undefined} data-closed={closed || undefined} data-open={selected ? "" : undefined} data-themed={selected ? "" : undefined}>
      {selected ? (
        <button
          type="button"
          className="sp-sheet-handle"
          aria-label="Dismiss pick slip"
          disabled={pending}
          onClick={() => { const wasDragged = dragged.current; dragged.current = false; if (!wasDragged) onClear() }}
          onPointerDown={(event) => {
            if (pending) return
            dragged.current = false
            dragStart.current = event.clientY
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (dragStart.current != null) setDragY(Math.max(0, event.clientY - dragStart.current))
          }}
          onPointerUp={(event) => {
            const distance = dragStart.current == null ? 0 : event.clientY - dragStart.current
            dragged.current = Math.abs(distance) > 5
            dragStart.current = null
            setDragY(0)
            if (distance >= 65) onClear()
            // Suppress the click after a short drag so it springs back instead of dismissing.
            if (distance > 5) event.preventDefault()
          }}
          onPointerCancel={() => { dragStart.current = null; dragged.current = false; setDragY(0) }}
        ><span /></button>
      ) : null}
      <div className="fw-section-head">
        <h2 id="sp-slip-title">Pick slip</h2>
        {selected ? (
          <button type="button" className="sp-clear" onClick={onClear} aria-label="Clear pick slip">
            <X aria-hidden /> Clear
          </button>
        ) : (
          <p>{credits(balance)} cash</p>
        )}
      </div>
      {!selected ? (
        <p className="sp-slip-empty">Tap a line to start a pick. The price you see is the price you get, and it can&apos;t change after you lock it in.</p>
      ) : (
        <form onSubmit={submit}>
          <div className="sp-slip-pick">
            <div className="sp-slip-top">
              {slipSide ? (
                <TeamBadge sport={selected.market.event.sport} name={slipSide} size={48} />
              ) : selected.market.kind === "player_prop" && selected.market.player ? (
                <PlayerBadge sport={selected.market.event.sport} name={selected.market.player} size={48} />
              ) : (
                <span className="sp-slip-sport">{SPORT_LABEL[selected.market.event.sport] ?? ""}</span>
              )}
              <div>
                <small>{marketTitle(selected.market)}</small>
                <strong>{pickSentence(selected.market, selected.line)}</strong>
              </div>
              <span className="sp-slip-odds">{formatOdds(selected.line.price)}</span>
            </div>
            <span className="sp-slip-game">
              {eventTitle(selected.market.event)} · {lockLabel(selected.market.lockAt)}
            </span>
          </div>
          <div>
            <label className="fw-label" htmlFor="sp-stake">
              Stake (play cash)
            </label>
            <input
              id="sp-stake"
              className="fw-input numeric"
              inputMode="numeric"
              autoComplete="off"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder={`${limits.minStake} to ${credits(limits.maxStake)}`}
              aria-describedby="sp-stake-hint"
              aria-invalid={problem ? true : undefined}
            />
            <p className="fw-hint" id="sp-stake-hint" role={problem ? "alert" : undefined}>
              {problem ? <span className="fw-bad">{problem}</span> : null}
            </p>
          </div>
          <div className="fw-quick">
            {[limits.minStake, Math.round(cap / 4), Math.round(cap / 2), cap].map((v, i) => (
              <button key={i} type="button" disabled={v < limits.minStake} aria-label={i === 3 ? `Stake the maximum, ${credits(cap)} cash` : `Stake ${credits(v)} cash`} onClick={() => setStake(String(Math.max(v, limits.minStake)))}>
                {i === 3 ? "Max" : credits(v)}
              </button>
            ))}
          </div>
          {moved != null ? (
            <p className="sp-slip-moved" role="status">
              Price updated from {formatOdds(moved)} to {formatOdds(selected!.line.price)}. Check it before you lock.
            </p>
          ) : null}
          <div className="sp-slip-return" aria-live="polite">
            <span className="fw-label" style={{ margin: 0 }}>
              To win
            </span>
            {amount > 0 && !problem ? <b>{credits(winnings)}</b> : <span className="sp-slip-hint">Enter a stake</span>}
          </div>
          <button type="submit" className="fw-submit" disabled={pending || closed || amount === 0 || !!problem} aria-busy={pending || undefined}>
            {pending ? <span className="spin" aria-hidden /> : null}
            {pending ? "Locking in…" : "Lock in pick"}
          </button>
          <p className="sp-fine">Play money only, nothing real is at stake. Picks can&apos;t be changed after they&apos;re locked in.</p>
        </form>
      )}
    </section>
  )
}

function MirrorReport({ leagueId }: { leagueId: string }) {
  const { data } = useApi<{ pairs: { a: string; b: string; markets: number }[] }>(`/api/sports/leagues/${leagueId}/report`)
  return (
    <section className="fw-panel reveal" style={revealStyle(5)} aria-labelledby="sp-report-title">
      <div className="fw-section-head">
        <h2 id="sp-report-title">Mirrored picks</h2>
        <p>Owner only</p>
      </div>
      {!data ? null : data.pairs.length === 0 ? (
        <p className="fw-empty">No one is consistently taking the opposite side of another player.</p>
      ) : (
        <ul className="fw-picks">
          {data.pairs.map((p) => (
            <li key={`${p.a}-${p.b}`} className="fw-pick">
              <div className="fw-pick-body">
                <strong>
                  {p.a} and {p.b}
                </strong>
                <span>Took opposite sides on {plural(p.markets, "market")}. Worth a look, not proof.</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Chance each side wins, from the moneyline prices with the bookmaker's margin taken out. */
function winChances(lines: Line[]): Record<string, number> | null {
  const home = lines.find((l) => l.selection === "home")
  const away = lines.find((l) => l.selection === "away")
  if (!home || !away) return null
  const ph = 1 / americanToDecimal(home.price)
  const pa = 1 / americanToDecimal(away.price)
  return { home: ph / (ph + pa), away: pa / (ph + pa) }
}

function GameCard({ game, selected, onSelect, disabled }: { game: { key: string; event: EventInfo; markets: Market[] }; selected: { line: Line } | null; onSelect: (m: Market, l: Line) => void; disabled: boolean }) {
  const { event } = game
  const tennis = event.sport === "tennis"
  const groups = (
    [
      { key: "winner", label: "Winner", test: (m: Market) => m.kind === "moneyline" },
      { key: "spread", label: "Spread", test: (m: Market) => m.kind === "spread" },
      { key: "total", label: "Total", test: (m: Market) => m.kind === "total" },
      { key: "props", label: "Props", test: (m: Market) => m.kind === "player_prop" },
    ] as const
  )
    .map((g) => ({ ...g, markets: game.markets.filter(g.test) }))
    .filter((g) => g.markets.length > 0)
  const [tab, setTab] = useState<string>(groups[0]?.key ?? "winner")
  const active = groups.find((g) => g.key === tab) ?? groups[0]
  const winner = game.markets.find((m) => m.kind === "moneyline")
  const lock = game.markets[0]?.lockAt
  const chances = winner ? winChances(winner.lines) : null
  const home = teamLook(event.sport, event.home)
  const away = teamLook(event.sport, event.away)
  const first = tennis ? event.home : event.away
  const second = tennis ? event.away : event.home
  const firstColor = tennis ? home.color : away.color
  const secondColor = tennis ? away.color : home.color

  return (
    <div className="sp-event sp-game">
      <div className="sp-game-head">
        <div className="sp-matchup">
          <TeamBadge sport={event.sport} name={first} />
          <span className="sp-at">{tennis ? "vs" : "@"}</span>
          <TeamBadge sport={event.sport} name={second} />
          <strong>{eventTitle(event)}</strong>
        </div>
        <span className="sp-game-meta">
          <b>{SPORT_LABEL[event.sport] ?? event.sport}</b> · {timeOf(event.startsAt)}
          {lock ? <span className="sp-lockpill"><Lock aria-hidden /> {lockLabel(lock)}</span> : null}
        </span>
      </div>

      {chances ? (
        <Tip block text="Implied win chance from the line. Prices can update until kickoff; a locked pick keeps its price.">
        <div className="sp-odds-bar" role="img" aria-label={`Win chance: ${event.away} ${Math.round(chances.away * 100)} percent, ${event.home} ${Math.round(chances.home * 100)} percent`}>
          <div className="sp-odds-track">
            <i style={{ width: `${(tennis ? chances.home : chances.away) * 100}%`, background: firstColor }} />
            <i style={{ flex: 1, background: secondColor }} />
          </div>
          <div className="sp-odds-labels">
            <span>{Math.round((tennis ? chances.home : chances.away) * 100)}% <small>{first.split(" ").pop()}</small></span>
            <span><small>{second.split(" ").pop()}</small> {Math.round((tennis ? chances.away : chances.home) * 100)}%</span>
          </div>
        </div>
        </Tip>
      ) : null}

      {groups.length > 1 ? (
        <div className="sp-tabs" role="tablist" aria-label="Markets">
          {groups.map((g) => (
            <button key={g.key} type="button" role="tab" aria-selected={active?.key === g.key} onClick={() => setTab(g.key)}>
              {g.label}
            </button>
          ))}
        </div>
      ) : null}

      {active ? (
        <div key={active.key} className="sp-panel" role="tabpanel">
          {active.markets.map((m) => (
            <div key={m.id} className="sp-market">
              {active.key === "props" ? <div className="sp-market-head"><span className="sp-market-title">{marketTitle(m)}</span></div> : null}
              <div className={`sp-lines${m.kind === "moneyline" ? " sp-team-lines" : ""}`}>
                {(m.kind === "moneyline" ? [...m.lines].sort((x, y) => (x.selection === (tennis ? "home" : "away") ? -1 : 1) - (y.selection === (tennis ? "home" : "away") ? -1 : 1)) : m.lines).map((l) => (
                  <LineButton key={l.id} market={m} line={l} selected={selected} onSelect={onSelect} disabled={disabled} team={m.kind === "moneyline"} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function LineButton({ market: m, line: l, selected, onSelect, disabled, team }: { market: Market; line: Line; selected: { line: Line } | null; onSelect: (m: Market, l: Line) => void; disabled: boolean; team?: boolean }) {
  const label = lineLabel(m, l)
  const mine = m.picked?.selection === l.selection
  const side = m.kind === "moneyline" || m.kind === "spread" ? (l.selection === "home" ? m.event.home : m.event.away) : null
  const look = side ? teamLook(m.event.sport, side) : null
  return (
    <button
      type="button"
      className="sp-line"
      data-team={team || undefined}
      aria-pressed={selected?.line.id === l.id || mine}
      data-picked={mine || undefined}
      disabled={disabled || !!m.picked}
      style={look ? ({ "--tc": look.color, "--tc-ink": onColor(look.color) } as React.CSSProperties) : undefined}
      aria-label={`${pickSentence(m, l)}, ${formatOdds(l.price)}, 100 cash wins ${winOn100(l.price)}${mine ? `, your pick, ${m.picked!.stake} cash` : ""}`}
      onClick={() => onSelect(m, l)}
    >
      {team && side ? <TeamBadge sport={m.event.sport} name={side} size={32} /> : m.kind === "player_prop" && m.player ? <PlayerBadge sport={m.event.sport} name={m.player} size={32} /> : look ? <i className="sp-dot" aria-hidden /> : null}
      <span className="sp-line-name">
        {label.name}
        {label.point ? <small>{label.point}</small> : null}
        {mine ? (
          <em className="sp-line-tag">
            <Lock aria-hidden /> Your pick · {credits(m.picked!.stake)}
          </em>
        ) : null}
      </span>
      <span className="sp-line-odds">
        <span className="sp-price">{formatOdds(l.price)}</span>
        <small>100 wins {winOn100(l.price)}</small>
      </span>
    </button>
  )
}
