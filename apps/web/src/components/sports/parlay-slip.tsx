"use client"

import "./parlay.css"
import { SlipEmpty } from "./slip-empty"
import { SheetHandle } from "./sheet-handle"
import { createContext, useCallback, useEffect, useMemo, useState } from "react"
import { Layers, Target, X, ChevronUp } from "lucide-react"
import { useToast } from "@web/components/ui/toast"
import { SlipPickCard } from "@web/components/sports/slip-pick-card"
import { LegStack } from "@web/components/sports/parlay-ticket"
import { onColor } from "@web/lib/sports/teams"
import { TeamBadge } from "@web/components/sports/team-badge"
import type { PickLockFx } from "@web/components/sports/pick-lock-effect"
import { eventTitle, formatCredits, formatOdds, marketTitle, pickSentence, sideTeam, type DisplayLine, type DisplayMarket } from "@web/lib/sports/format"
import { parlayQuote } from "@web/lib/sports/parlay-math"
import { marketSelectionColor } from "@web/lib/sports/matchup-colors"
import { mutate } from "@web/lib/use-api"
import type { ParlayLimits } from "@web/components/sports/parlay-types"

export type PMarket = DisplayMarket & { id: string; lockAt: string; lines: PLine[]; event: { sport: string; home: string; away: string; startsAt: string } }
export type PLine = DisplayLine & { id: string; price: number }
/** `seen` is the price the player has looked at and agreed to; if the live price moves off it, locking waits for an accept. */
export type ParlayLeg = { market: PMarket; line: PLine; seen: number }

const PARLAY_KINDS = new Set(["moneyline", "spread", "total"])
const DEFAULT_RULES = { minLegs: 2, maxLegs: 6 }
const eventKey = (e: PMarket["event"]) => `${e.sport}|${e.home}|${e.away}|${e.startsAt}`
const credits = formatCredits

/** Ids of the lines currently on the parlay slip, so game cards can highlight them. */
export const ParlayIdsContext = createContext<ReadonlySet<string> | null>(null)

/** Parlay slip state: mode, legs (kept fresh against the latest markets), and short plain-language notes. */
export function useParlay(markets: PMarket[] | undefined, now: number, rules: { minLegs: number; maxLegs: number } = DEFAULT_RULES) {
  const [mode, setMode] = useState<"single" | "parlay">("single")
  const [stored, setStored] = useState<ParlayLeg[]>([])
  const [note, setNote] = useState<string | null>(null)
  const { maxLegs } = rules

  // Always show the latest price for a leg; one that has locked or vanished is dropped below.
  const resolved = useMemo(() => {
    if (!markets) return stored
    return stored.flatMap((leg) => {
      const market = markets.find((m) => m.id === leg.market.id)
      const line = market?.lines.find((l) => l.id === leg.line.id)
      return market && line && Date.parse(market.lockAt) > now && Date.parse(market.event.startsAt) > now ? [{ ...leg, market, line }] : []
    })
  }, [markets, stored, now])

  useEffect(() => {
    if (!markets || resolved.length === stored.length) return
    const alive = new Set(resolved.map((l) => l.line.id))
    const closed = stored.filter((l) => !alive.has(l.line.id))
    setStored(resolved)
    setNote(`${closed.map((l) => pickSentence(l.market, l.line)).join(", ")} ${closed.length === 1 ? "is" : "are"} no longer open and ${closed.length === 1 ? "was" : "were"} removed from your slip.`)
  }, [markets, resolved, stored])

  const toggle = useCallback(
    (market: PMarket, line: PLine) => {
      setNote(null)
      if (!PARLAY_KINDS.has(market.kind)) return setNote("Parlays take winner, spread and total lines only.")
      if (stored.some((l) => l.line.id === line.id)) return setStored(stored.filter((l) => l.line.id !== line.id))
      const sameGame = stored.find((l) => eventKey(l.market.event) === eventKey(market.event))
      if (sameGame && sameGame.market.id !== market.id) return setNote(`One leg per game. Remove ${pickSentence(sameGame.market, sameGame.line)} to pick another market for this game.`)
      if (sameGame) return setStored(stored.map((l) => (l === sameGame ? { market, line, seen: line.price } : l)))
      if (stored.length >= maxLegs) return setNote(`A parlay takes up to ${maxLegs} legs.`)
      setStored([...stored, { market, line, seen: line.price }])
    },
    [stored, maxLegs],
  )

  return {
    mode,
    setMode: (next: "single" | "parlay") => { setNote(null); setMode(next) },
    legs: resolved,
    ids: useMemo(() => new Set(resolved.map((l) => l.line.id)), [resolved]) as ReadonlySet<string>,
    note,
    setNote,
    toggle,
    remove: (lineId: string) => { setNote(null); setStored(stored.filter((l) => l.line.id !== lineId)) },
    clear: () => { setNote(null); setStored([]) },
    accept: () => setStored(resolved.map((l) => ({ ...l, seen: l.line.price }))),
  }
}

/** A sliding mode control; the parent keeps guidance outside the compact toolbar. */
export function ParlayModeBar({ mode, onMode, count, disabled }: { disabled?: boolean; mode: "single" | "parlay"; onMode: (m: "single" | "parlay") => void; count: number }) {
  return (
    <div className="pl-switch" data-mode={mode} role="group" aria-label="Bet type">
      <button type="button" disabled={disabled} aria-pressed={mode === "single"} onClick={() => onMode("single")}><Target aria-hidden /><span>Single</span></button>
      <button type="button" disabled={disabled} aria-pressed={mode === "parlay"} onClick={() => onMode("parlay")}>
        <Layers aria-hidden /><span>Parlay</span>{count > 0 ? <b className="numeric">{count}</b> : null}
      </button>
    </div>
  )
}

const GOLD = "#c4a15b"
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

export function ParlaySlip({
  leagueId,
  legs,
  note,
  balance,
  limits,
  closed,
  onRemove,
  onClear,
  onMinimize,
  onAccept,
  onLock,
  onPlaced,
  onStale,
  onDraft,
}: {
  onDraft?: (draft: { stake: number; toWin: number | null }) => void
  leagueId: string
  legs: ParlayLeg[]
  note: string | null
  balance: number
  limits: { minStake: number; maxStake: number; parlay?: ParlayLimits }
  closed: boolean
  onRemove: (lineId: string) => void
  onClear: () => void
  onMinimize?: () => void
  onAccept: () => void
  onLock: (fx: PickLockFx) => void
  onPlaced: () => void
  onStale: () => void
}) {
  const { toast } = useToast()
  const rules = limits.parlay ?? { ...DEFAULT_RULES, minStake: limits.minStake, maxStake: limits.maxStake }
  const [stake, setStake] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [requestId, setRequestId] = useState(newKey)
  // A different set of legs is a different ticket: a fresh idempotency key and no stale error.
  const legKey = legs.map((l) => l.line.id).join(",")
  useEffect(() => {
    setRequestId(newKey())
    setError(null)
  }, [legKey])

  const cap = Math.min(rules.maxStake, balance)
  const amount = Math.floor(Number(stake.replace(/[^\d]/g, "")) || 0)
  const quote = parlayQuote(legs.map((l) => l.line.price), amount)
  const ready = legs.length >= rules.minLegs && amount > 0 && !!quote
  useEffect(() => { onDraft?.({ stake: legs.length ? amount : 0, toWin: ready && quote ? quote.toWin : null }) }, [onDraft, legs.length, amount, ready, quote?.toWin]) // eslint-disable-line react-hooks/exhaustive-deps
  const moved = legs.filter((l) => l.line.price !== l.seen)
  const short = rules.minLegs - legs.length
  const problem = amount === 0 ? null : amount < rules.minStake ? `Minimum is ${credits(rules.minStake)}` : amount > rules.maxStake ? `Maximum per parlay is ${credits(rules.maxStake)}` : amount > balance ? "Not enough cash" : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (legs.length < rules.minLegs || amount === 0 || problem || moved.length > 0 || !quote) return
    setPending(true)
    setError(null)
    try {
      await mutate(`/api/sports/leagues/${leagueId}/parlays`, {
        body: { legs: legs.map((l) => ({ lineId: l.line.id, expectedPrice: l.line.price, expectedPoint: l.line.point })), stake: amount, requestId },
      })
      onLock({ id: Date.now(), color: "#3fae7f", ink: "#ffffff", title: `${legs.length}-leg parlay`, sub: `${credits(amount)} at ${formatOdds(quote.american)} · to win ${credits(quote.toWin)}`, odds: formatOdds(quote.american), from: balance, to: balance - amount, big: quote.american >= 200 })
      toast("Parlay locked in.", "success")
      setStake("")
      setRequestId(newKey())
      onPlaced()
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't place that parlay."
      setError(message)
      toast(message, "error")
      if (/line moved|line changed|price/i.test(message)) onStale()
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="fw-panel fw-trade sp-slip sp-sheet pl-slip" style={{ "--tc": GOLD, "--tc-ink": onColor(GOLD) } as React.CSSProperties} aria-labelledby="pl-slip-title" data-open={legs.length > 0 ? "" : undefined} data-themed={legs.length > 0 || undefined} data-min={!expanded || undefined} data-closed={closed || undefined}>
      {legs.length > 0 && onMinimize ? <SheetHandle onMinimize={onMinimize} disabled={pending} /> : null}
      <div className="fw-section-head pl-slip-head">
        <h2 id="pl-slip-title">Parlay slip</h2>
        {legs.length > 0 ? (
          <>
            <span className="pl-slip-sum numeric">{legs.length} {legs.length === 1 ? "leg" : "legs"}{quote && legs.length >= rules.minLegs ? ` · ${formatOdds(quote.american)}` : ""}</span>
            <button type="button" className="pl-toggle" aria-expanded={expanded} aria-label={expanded ? "Hide parlay slip" : "Review parlay slip"} onClick={() => setExpanded(!expanded)}><ChevronUp aria-hidden /></button>
            <button type="button" className="sp-clear" onClick={onClear} aria-label="Clear parlay slip"><X aria-hidden /> Clear</button>
          </>
        ) : (
          <p>{credits(balance)} cash</p>
        )}
      </div>
      {legs.length === 0 ? (
        <SlipEmpty parlay min={rules.minLegs} max={rules.maxLegs} />
      ) : (
        <form onSubmit={submit}>
          <SlipPickCard
            sport={legs[0]!.market.event.sport}
            side={null}
            mark={<LegStack legs={legs.map((l) => ({ lineId: l.line.id, selection: l.line.selection, price: l.line.price, point: l.line.point ?? null, status: "open" as const, market: { kind: l.market.kind, player: null }, event: l.market.event }))} />}
            kicker="Parlay"
            title={`${legs.length}-leg parlay`}
            price={quote && short <= 0 ? quote.american : null}
            game={short > 0 ? `Add ${short} more ${short === 1 ? "leg" : "legs"} to lock it in` : "Every leg has to win"}
            color={GOLD}
          />
          <ul className="pl-legs" aria-label="Parlay legs">
            {legs.map((l, index) => {
              const side = sideTeam(l.market.event, l.market.kind, l.line.selection)
              const color = marketSelectionColor(l.market.event, l.market.kind, l.line.selection)
              const sentence = pickSentence(l.market, l.line)
              return (
                <li key={l.line.id} className="pl-leg" data-themed={!!color || undefined} style={color ? ({ "--tc": color } as React.CSSProperties) : undefined}>
                  {side && l.market.event.sport !== "tennis" ? <span className="pl-leg-watermark" aria-hidden><TeamBadge sport={l.market.event.sport} name={side} size={100} /></span> : null}
                  <span className="pl-leg-mark">{side ? <TeamBadge sport={l.market.event.sport} name={side} size={30} /> : <span className="sl-prop"><Target aria-hidden /></span>}</span>
                  <div className="pl-leg-body">
                    <small>{marketTitle(l.market)}</small>
                    <b>{sentence}</b>
                  </div>
                  <em className="pl-odds numeric">{formatOdds(l.line.price)}</em>
                  <button type="button" className="pl-remove" aria-label={`Remove ${sentence}`} onClick={() => onRemove(l.line.id)}><X aria-hidden /></button>
                  <div className="pl-leg-matchup"><span>LEG {String(index + 1).padStart(2, "0")}</span><span>{eventTitle(l.market.event)}</span></div>
                </li>
              )
            })}
          </ul>
          {note ? <p className="pl-note" role="status">{note}</p> : null}
          {moved.length > 0 ? (
            <div className="sp-slip-moved" role="alert">
              {moved.length === 1 ? "A price" : `${moved.length} prices`} changed: {moved.map((l) => `${pickSentence(l.market, l.line)} ${formatOdds(l.seen)} to ${formatOdds(l.line.price)}`).join(", ")}. Accept the new {moved.length === 1 ? "price" : "prices"} to lock this parlay.
              <button type="button" className="fw-btn" data-solid onClick={onAccept}>Accept new prices</button>
            </div>
          ) : null}
          <div>
            <label className="fw-label" htmlFor="pl-stake">Stake (play cash)</label>
            <input id="pl-stake" className="fw-input numeric" inputMode="numeric" autoComplete="off" value={stake} onChange={(e) => { setStake(e.target.value); setError(null) }} placeholder={`${credits(rules.minStake)} to ${credits(rules.maxStake)}`} aria-describedby="pl-stake-hint" aria-invalid={problem ? true : undefined} />
            <p className="fw-hint" id="pl-stake-hint" role={problem ? "alert" : undefined}>
              {problem ? <span className="fw-bad">{problem}</span> : <span>Max {credits(rules.maxStake)} per parlay{balance < rules.maxStake ? `, limited by your ${credits(balance)} cash` : ""}</span>}
            </p>
          </div>
          <div className="fw-quick">
            {[rules.minStake, Math.round(cap / 4), Math.round(cap / 2), cap].map((v, i) => (
              <button key={i} type="button" disabled={v < rules.minStake} aria-label={i === 3 ? `Stake the maximum, ${credits(cap)} cash` : `Stake ${credits(v)} cash`} onClick={() => setStake(String(Math.max(v, rules.minStake)))}>
                {i === 3 ? "Max" : credits(v)}
              </button>
            ))}
          </div>
          <div className="sp-slip-return" aria-live="polite">
            <span className="fw-label" style={{ margin: 0 }}>To win</span>
            {amount > 0 && !problem && quote && short <= 0 ? <b>{credits(quote.toWin)}</b> : <span className="sp-slip-hint">Enter a stake</span>}
          </div>
          {error ? <p className="sp-slip-moved" role="alert">{error}</p> : null}
          <button type="submit" className="fw-submit" disabled={pending || closed || short > 0 || moved.length > 0 || amount === 0 || !!problem} aria-busy={pending || undefined}>
            {pending ? <span className="spin" aria-hidden /> : <Layers aria-hidden />}
            {pending ? "Locking in…" : "Lock in parlay"}
          </button>
          <p className="sp-fine">Every leg has to win. One loss loses the parlay; a push drops that leg. One leg per game, locks at the earliest kickoff. Play money only, and a locked parlay can&apos;t be changed.</p>
        </form>
      )}
    </section>
  )
}
