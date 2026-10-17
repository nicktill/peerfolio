"use client"

import "@web/components/fantasy/fantasy-workspace.css"
import "@web/components/sports/sports-workspace.css"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, Clock, Flag, Infinity as Forever, Link2, Lock, Minus, Undo2, X } from "lucide-react"
import { Stat } from "@web/components/fantasy/balance-cards"
import { Choice } from "@web/components/fantasy/choice"
import { timeLeft } from "@web/components/fantasy/time-left"
import { revealStyle } from "@web/components/motion/reveal"
import { LeaguePageSkeleton } from "@web/components/skeletons"
import { useToast } from "@web/components/ui/toast"
import { useFantasyMode } from "@web/components/sports/mode-switch"
import { eventTitle, formatOdds, lineLabel, lockLabel, marketTitle, pickSentence, SPORT_LABEL, winOn100, type DisplayLine, type DisplayMarket } from "@web/lib/sports/format"
import { americanToDecimal } from "@web/lib/sports/odds"
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

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
const credits = (n: number) => n.toLocaleString()
const asMarket = (p: PickRow): DisplayMarket => ({ ...p.market, event: p.event })

export default function SportsLeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [, setSide] = useFantasyMode()
  // Landing here means Sports is the side you're on; "Fantasy leagues" then returns to it.
  useEffect(() => setSide("sports"), [setSide])

  const { data, error, loading, refetch } = useApi<Detail>(`/api/sports/leagues/${id}`, [], { refreshMs: 60_000 })
  const [selected, setSelected] = useState<{ market: Market; line: Line } | null>(null)
  const [sport, setSport] = useState<string>("all")

  if (loading && !data) return <LeaguePageSkeleton />
  if (!data) return <p className="text-sm text-muted-foreground">{error ?? "Couldn't load this league."}</p>

  const { league, you, standings, markets, picks, leaguePicks } = data
  const rank = standings.findIndex((s) => s.isYou) + 1
  const atRisk = picks.filter((p) => p.status === "open").reduce((sum, p) => sum + p.stake, 0)
  const ended = !!league.endsAt && new Date(league.endsAt).getTime() < Date.now()
  const status = ended ? "Final standings" : league.endsAt ? timeLeft(league.endsAt) : "No end"
  const shown = sport === "all" ? markets : markets.filter((m) => m.event.sport === sport)

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
              <p>Fixed contest lines, not live odds</p>
            </div>
            <p className="sp-explain">
              Everyone gets the same line, and it never changes once you lock a pick in. <b>+125</b> means 100 credits wins 125. <b>-110</b> means risking 110 wins 100. On a <b>spread</b>, your team must win by more than the number (or lose by less).
            </p>
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
            <Markets markets={shown} selected={selected} onSelect={(market, line) => setSelected({ market, line })} disabled={ended} />
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

          <PickList
            title="Locked picks"
            note="Everyone's picks, once the market closes"
            empty="Picks show up here after each market locks, never before."
            picks={leaguePicks}
            delay={4}
          />
          {league.isOwner ? <MirrorReport leagueId={league.id} /> : null}
        </div>

        <aside className="fw-rail reveal" style={revealStyle(3)}>
          <Slip
            key={selected?.line.id ?? "none"}
            leagueId={league.id}
            selected={selected}
            balance={you.credits}
            limits={data.limits}
            closed={ended}
            onClear={() => setSelected(null)}
            onPlaced={() => {
              setSelected(null)
              void refetch()
            }}
          />
          <PickList title="Your picks" note={picks.length === 0 ? "None yet" : plural(picks.length, "pick")} empty="Nothing yet. Credits don't win leagues." picks={picks} delay={4} />
        </aside>
      </div>
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
            <div className="sp-event">
              <div className="sp-event-head">
                <strong>{eventTitle(g.event)}</strong>
                <span>
                  {SPORT_LABEL[g.event.sport] ?? g.event.sport} · {timeOf(g.event.startsAt)}
                </span>
              </div>
              {g.markets.map((m) => (
                <div key={m.id} className="sp-market">
                  <div className="sp-market-head">
                    <span className="sp-market-title">{marketTitle(m)}</span>
                    <span className="sp-lock">{lockLabel(m.lockAt)}</span>
                  </div>
                  <div className="sp-lines">
                    {m.lines.map((l) => {
                      const label = lineLabel(m, l)
                      const mine = m.picked?.selection === l.selection
                      return (
                        <button
                          key={l.id}
                          type="button"
                          className="sp-line"
                          aria-pressed={selected?.line.id === l.id || mine}
                          data-picked={mine || undefined}
                          disabled={disabled || !!m.picked}
                          aria-label={`${pickSentence(m, l)}, ${formatOdds(l.price)}, 100 credits wins ${winOn100(l.price)}${mine ? `, your pick, ${m.picked!.stake} credits` : ""}`}
                          onClick={() => onSelect(m, l)}
                        >
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
                    })}
                  </div>
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
  onClear,
  onPlaced,
}: {
  leagueId: string
  selected: { market: Market; line: Line } | null
  balance: number
  limits: Detail["limits"]
  closed: boolean
  onClear: () => void
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
    <section className="fw-panel fw-trade sp-slip sp-sheet reveal" style={revealStyle(3)} aria-labelledby="sp-slip-title" data-closed={closed || undefined} data-open={selected ? "" : undefined}>
      <div className="fw-section-head">
        <h2 id="sp-slip-title">Pick slip</h2>
        {selected ? (
          <button type="button" className="sp-clear" onClick={onClear} aria-label="Clear pick slip">
            <X aria-hidden /> Clear
          </button>
        ) : (
          <p>{credits(balance)} credits</p>
        )}
      </div>
      {!selected ? (
        <p className="sp-slip-empty">Tap a line to start a pick. The price you see is the price you get, and it can&apos;t change after you lock it in.</p>
      ) : (
        <form onSubmit={submit}>
          <div className="sp-slip-pick">
            <strong>{pickSentence(selected.market, selected.line)}</strong>
            <span>
              {marketTitle(selected.market)} · {formatOdds(selected.line.price)}
            </span>
            <span>
              {eventTitle(selected.market.event)} · {lockLabel(selected.market.lockAt)}
            </span>
          </div>
          <div>
            <label className="fw-label" htmlFor="sp-stake">
              Stake (credits)
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
              <button key={i} type="button" disabled={v < limits.minStake} aria-label={i === 3 ? `Stake the maximum, ${credits(cap)} credits` : `Stake ${credits(v)} credits`} onClick={() => setStake(String(Math.max(v, limits.minStake)))}>
                {i === 3 ? "Max" : credits(v)}
              </button>
            ))}
          </div>
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
          <p className="sp-fine">Play credits only. Picks can&apos;t be changed after they&apos;re locked in.</p>
        </form>
      )}
    </section>
  )
}

/** Text, an icon and a sign carry the result, so colour is never the only signal. */
const RESULT: Record<string, { label: string; icon: React.ReactNode }> = {
  open: { label: "Open", icon: <Clock aria-hidden /> },
  won: { label: "Won", icon: <Check aria-hidden /> },
  lost: { label: "Lost", icon: <X aria-hidden /> },
  push: { label: "Push", icon: <Minus aria-hidden /> },
  void: { label: "Refunded", icon: <Undo2 aria-hidden /> },
}

function PickList({ title, note, empty, picks, delay }: { title: string; note: string; empty: string; picks: (PickRow & { name?: string })[]; delay: number }) {
  const id = `sp-${title.toLowerCase().replace(/\W+/g, "-")}`
  return (
    <section className="fw-panel reveal" style={revealStyle(delay)} aria-labelledby={id}>
      <div className="fw-section-head">
        <h2 id={id}>{title}</h2>
        <p>{note}</p>
      </div>
      {picks.length === 0 ? (
        <p className="fw-empty">{empty}</p>
      ) : (
        <ul className="fw-picks">
          {picks.map((p) => {
            const m = asMarket(p)
            const r = RESULT[p.status] ?? RESULT.open!
            const net = p.payout == null ? null : p.payout - p.stake
            return (
              <li key={p.id} className="fw-pick sp-pick">
                <div className="fw-pick-body">
                  <strong>
                    {p.name ? <span className="sp-pick-who">{p.name}: </span> : null}
                    {pickSentence(m, p)}
                  </strong>
                  <span>
                    {eventTitle(p.event)} · {SPORT_LABEL[p.event.sport] ?? p.event.sport} · {marketTitle(m)}
                  </span>
                  <span className="numeric">
                    {credits(p.stake)} at {formatOdds(p.price)} · {p.payout == null ? `returns ${credits(p.totalReturn)} if it wins` : `paid ${credits(p.payout)}`}
                  </span>
                </div>
                <div className="fw-pick-side">
                  <span className="sp-result" data-status={p.status}>
                    {r.icon}
                    {r.label}
                  </span>
                  {net != null && p.status !== "open" ? <span className="sp-net numeric">{net > 0 ? `+${credits(net)}` : net < 0 ? `−${credits(-net)}` : "0"}</span> : null}
                </div>
              </li>
            )
          })}
        </ul>
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
