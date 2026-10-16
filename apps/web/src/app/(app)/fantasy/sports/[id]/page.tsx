"use client"

import "@web/components/fantasy/fantasy-workspace.css"
import "@web/components/sports/sports-workspace.css"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, Clock, Flag, Infinity as Forever, Link2, Lock } from "lucide-react"
import { Stat } from "@web/components/fantasy/balance-cards"
import { timeLeft } from "@web/components/fantasy/time-left"
import { revealStyle } from "@web/components/motion/reveal"
import { LeaguePageSkeleton } from "@web/components/skeletons"
import { useToast } from "@web/components/ui/toast"
import { useFantasyMode } from "@web/components/sports/mode-switch"
import { formatOdds, lineLabel, marketTitle, SPORT_LABEL, type DisplayLine, type DisplayMarket } from "@web/lib/sports/format"
import { americanToDecimal } from "@web/lib/sports/odds"
import { plural } from "@web/lib/plural"
import { mutate, useApi } from "@web/lib/use-api"

type Line = DisplayLine & { id: string; price: number }
type Market = DisplayMarket & {
  id: string
  lockAt: string
  picked: boolean
  event: { sport: string; home: string; away: string; startsAt: string }
  lines: Line[]
}
type PickRow = { id: string; marketId: string; selection: string; stake: number; price: number; point: number | null; totalReturn: number; status: string; acceptedAt: string }
type Detail = {
  league: { id: string; name: string; emoji: string; accent: string; sports: string[]; inviteCode: string; startingCredits: number; endsAt: string | null }
  you: { credits: number }
  limits: { minStake: number; maxStake: number; maxOpenPicks: number }
  standings: { name: string; credits: number; isYou: boolean }[]
  markets: Market[]
  picks: PickRow[]
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
const credits = (n: number) => n.toLocaleString()

export default function SportsLeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [, setSide] = useFantasyMode()
  // Landing here means Sports is the side you're on; Back to "Fantasy" then returns to it.
  useEffect(() => setSide("sports"), [setSide])

  const { data, error, loading, refetch } = useApi<Detail>(`/api/sports/leagues/${id}`, [], { refreshMs: 60_000 })
  const [selected, setSelected] = useState<{ market: Market; line: Line } | null>(null)

  if (loading && !data) return <LeaguePageSkeleton />
  if (!data) return <p className="text-sm text-muted-foreground">{error ?? "Couldn't load this league."}</p>

  const { league, you, standings, markets, picks } = data
  const rank = standings.findIndex((s) => s.isYou) + 1
  const atRisk = picks.filter((p) => p.status === "open").reduce((sum, p) => sum + p.stake, 0)
  const ended = !!league.endsAt && new Date(league.endsAt).getTime() < Date.now()
  const status = ended ? "Final standings" : league.endsAt ? timeLeft(league.endsAt) : "No end"

  return (
    <div className="fw">
      <Link href="/fantasy" className="fw-back">
        <ArrowLeft className="size-3.5" aria-hidden /> Fantasy leagues
      </Link>

      <header className="fw-head reveal" data-accent={league.accent} style={revealStyle(0)}>
        <div className="fw-identity">
          <span className="fw-art" data-accent={league.accent} aria-hidden>
            <span>{league.emoji}</span>
          </span>
          <div>
            <span className="fw-eyebrow">Sports / Play credits</span>
            <h1>{league.name}</h1>
          </div>
        </div>
        <ul className="fw-meta" aria-label="League rules">
          <li className="fw-meta-status">{status}</li>
          <li>{plural(standings.length, "player")}</li>
          <li>{credits(league.startingCredits)} credits each</li>
          <li>{league.sports.map((s) => SPORT_LABEL[s] ?? s).join(" · ")}</li>
        </ul>
        <div className="fw-actions">
          <span className="fw-pill">
            {ended ? <Flag aria-hidden /> : league.endsAt ? <Clock aria-hidden /> : <Forever aria-hidden />}
            {status}
          </span>
          <InviteButton code={league.inviteCode} />
        </div>
      </header>

      <dl className="fw-panel fw-scoreboard sp-scoreboard reveal" style={revealStyle(1)}>
        <Stat label="Your rank">
          <span className="fw-figure">
            #{rank}
            <small>of {standings.length}</small>
          </span>
        </Stat>
        <Stat label="Credits">
          <span className="fw-figure numeric">{credits(you.credits)}</span>
        </Stat>
        <Stat label="At risk">
          <span className="fw-figure numeric">{credits(atRisk)}</span>
        </Stat>
      </dl>

      <div className="fw-grid">
        <div className="fw-main">
          <section className="fw-panel reveal" style={revealStyle(2)} aria-labelledby="sp-markets-title">
            <div className="fw-section-head">
              <h2 id="sp-markets-title">Open lines</h2>
              <p>Lines are fixed for everyone. Picks close before kickoff.</p>
            </div>
            <Markets markets={markets} selected={selected} onSelect={(market, line) => setSelected({ market, line })} disabled={ended} />
          </section>

          <section className="fw-panel reveal" style={revealStyle(3)} aria-labelledby="sp-standings-title">
            <div className="fw-section-head">
              <h2 id="sp-standings-title">Standings</h2>
              <p>Credits plus what&apos;s still riding.</p>
            </div>
            <ul className="fw-rows">
              {standings.map((s, i) => (
                <li key={`${s.name}-${i}`} className={`fw-standing sp-standing ${s.isYou ? "fw-you" : ""}`}>
                  <span className="fw-rank" data-rank={i + 1}>{i + 1}</span>
                  <div className="fw-standing-who">
                    <strong>
                      <span>{s.name}</span>
                      {s.isYou ? <span className="fw-you-tag">You</span> : null}
                    </strong>
                  </div>
                  <span className="fw-return numeric">{credits(s.credits)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="fw-rail reveal" style={revealStyle(3)}>
          <Slip
            key={selected?.line.id ?? "none"}
            leagueId={league.id}
            selected={selected}
            balance={you.credits}
            limits={data.limits}
            closed={ended}
            onPlaced={() => {
              setSelected(null)
              void refetch()
            }}
          />
          <MyPicks picks={picks} markets={markets} />
        </aside>
      </div>
    </div>
  )
}

function InviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="fw-btn"
      data-solid
      onClick={() => {
        void navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      {copied ? "Code copied" : `Invite code ${code}`}
    </button>
  )
}

function Markets({ markets, selected, onSelect, disabled }: { markets: Market[]; selected: { line: Line } | null; onSelect: (m: Market, l: Line) => void; disabled: boolean }) {
  // Group by game, then by day, in kickoff order (the API already sorts by start).
  const games = useMemo(() => {
    const byEvent = new Map<string, { key: string; event: Market["event"]; markets: Market[] }>()
    for (const m of markets) {
      const key = `${m.event.sport}|${m.event.home}|${m.event.away}|${m.event.startsAt}`
      const g = byEvent.get(key) ?? { key, event: m.event, markets: [] }
      g.markets.push(m)
      byEvent.set(key, g)
    }
    return [...byEvent.values()]
  }, [markets])

  if (games.length === 0) return <p className="fw-empty">No open lines right now. New games post a day or two ahead.</p>

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
            <div className="sp-event">
              <div className="sp-event-head">
                <strong>
                  {g.event.away} <span aria-hidden>@</span> {g.event.home}
                </strong>
                <span>
                  {SPORT_LABEL[g.event.sport] ?? g.event.sport} · {timeOf(g.event.startsAt)}
                </span>
              </div>
              {g.markets.map((m) => (
                <div key={m.id} className="sp-market">
                  <span className="sp-market-title">{marketTitle(m)}</span>
                  <div className="sp-lines">
                    {m.lines.map((l) => {
                      const label = lineLabel(m, l)
                      return (
                        <button
                          key={l.id}
                          type="button"
                          className="sp-line"
                          aria-pressed={selected?.line.id === l.id}
                          disabled={disabled || m.picked}
                          onClick={() => onSelect(m, l)}
                        >
                          <span className="sp-line-name">
                            {label.name}
                            {label.point ? <small>{label.point}</small> : null}
                          </span>
                          <span className="sp-price">{formatOdds(l.price)}</span>
                        </button>
                      )
                    })}
                  </div>
                  {m.picked ? (
                    <span className="sp-picked">
                      <Lock aria-hidden /> Picked
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
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
  onPlaced,
}: {
  leagueId: string
  selected: { market: Market; line: Line } | null
  balance: number
  limits: Detail["limits"]
  closed: boolean
  onPlaced: () => void
}) {
  const { toast } = useToast()
  const [stake, setStake] = useState("")
  const [pending, setPending] = useState(false)
  // One key per slip: a double tap or a retry after a dropped response places a single pick.
  const [requestId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`))

  const cap = Math.min(limits.maxStake, balance)
  const amount = Math.floor(Number(stake.replace(/[^\d]/g, "")) || 0)
  const winnings = selected ? Math.floor(amount * americanToDecimal(selected.line.price)) - amount : 0
  const problem =
    amount === 0 ? null : amount < limits.minStake ? `Minimum is ${limits.minStake}` : amount > limits.maxStake ? `Maximum per pick is ${credits(limits.maxStake)}` : amount > balance ? "Not enough credits" : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || amount === 0 || problem) return
    setPending(true)
    try {
      await mutate(`/api/sports/leagues/${leagueId}/picks`, {
        body: { lineId: selected.line.id, stake: amount, expectedPrice: selected.line.price, expectedPoint: selected.line.point, requestId },
      })
      toast("Pick locked in.", "success")
      onPlaced()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't place that pick.", "error")
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="fw-panel fw-trade sp-slip reveal" style={revealStyle(3)} aria-labelledby="sp-slip-title" data-closed={closed || undefined}>
      <div className="fw-section-head">
        <h2 id="sp-slip-title">Pick slip</h2>
        <p>{credits(balance)} credits</p>
      </div>
      {!selected ? (
        <p className="sp-slip-empty">Tap a line to start a pick. The price you see is the price you get, and it can&apos;t change after you lock it in.</p>
      ) : (
        <form onSubmit={submit}>
          <div className="sp-slip-pick">
            <strong>
              {lineLabel(selected.market, selected.line).name} {lineLabel(selected.market, selected.line).point}
            </strong>
            <span>
              {marketTitle(selected.market)} · {formatOdds(selected.line.price)}
            </span>
            <span>
              {selected.market.event.away} @ {selected.market.event.home}
            </span>
          </div>
          <div>
            <label className="fw-label" htmlFor="sp-stake">
              Stake (credits)
            </label>
            <input id="sp-stake" className="fw-input numeric" inputMode="numeric" autoComplete="off" value={stake} onChange={(e) => setStake(e.target.value)} placeholder={`${limits.minStake} to ${credits(limits.maxStake)}`} />
            <p className="fw-hint">{problem ? <span className="fw-bad">{problem}</span> : null}</p>
          </div>
          <div className="fw-quick">
            {[limits.minStake, Math.round(cap / 4), Math.round(cap / 2), cap].map((v, i) => (
              <button key={i} type="button" disabled={v < limits.minStake} onClick={() => setStake(String(Math.max(v, limits.minStake)))}>
                {i === 3 ? "Max" : credits(v)}
              </button>
            ))}
          </div>
          <div className="sp-slip-return">
            <span className="fw-label" style={{ margin: 0 }}>
              To win
            </span>
            <b>{amount > 0 && !problem ? credits(winnings) : "–"}</b>
          </div>
          <button type="submit" className="fw-submit" disabled={pending || closed || amount === 0 || !!problem} aria-busy={pending || undefined}>
            {pending ? <span className="spin" aria-hidden /> : null}
            {pending ? "Locking in…" : "Lock in pick"}
          </button>
          <p className="sp-fine">Play credits only. Picks can&apos;t be changed after they&apos;re locked in.</p>
        </form>
      )}
    </section>
  )
}

const STATUS_LABEL: Record<string, string> = { open: "Open", won: "Won", lost: "Lost", push: "Push", void: "Refunded" }

function MyPicks({ picks, markets }: { picks: PickRow[]; markets: Market[] }) {
  return (
    <section className="fw-panel reveal" style={revealStyle(4)} aria-labelledby="sp-picks-title">
      <div className="fw-section-head">
        <h2 id="sp-picks-title">Your picks</h2>
        <p>{picks.length === 0 ? "None yet" : plural(picks.length, "pick")}</p>
      </div>
      {picks.length === 0 ? (
        <p className="fw-empty">Nothing yet. Credits don&apos;t win leagues.</p>
      ) : (
        <ul className="fw-picks">
          {picks.map((p) => {
            const market = markets.find((m) => m.id === p.marketId)
            const label = market ? lineLabel(market, { selection: p.selection, point: p.point }) : null
            return (
              <li key={p.id} className="fw-pick">
                <div className="fw-pick-body">
                  <strong>{label ? `${label.name} ${label.point}`.trim() : p.selection}</strong>
                  <span className="numeric">
                    {credits(p.stake)} at {formatOdds(p.price)} · returns {credits(p.totalReturn)}
                  </span>
                </div>
                <div className="fw-pick-side">
                  <span className="sp-result" data-status={p.status}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
