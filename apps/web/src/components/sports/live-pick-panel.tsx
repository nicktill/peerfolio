"use client"

import { useEffect, useRef, useState } from 'react'
import { Zap, X } from 'lucide-react'
import { TeamBadge } from './team-badge'
import { LiveNumber } from './live-delta'
import { onColor } from '@web/lib/sports/teams'
import { SheetHandle } from './sheet-handle'
import { matchupColors } from '@web/lib/sports/matchup-colors'
import { useLiveGame } from './live-game'
import { useToast } from '@web/components/ui/toast'
import { ageView } from '@web/lib/sports/live/view'
import { LIVE_TEST, testOffer, type TestOffer } from '@web/lib/sports/live-test'
import { LIVE_PICK, liveMaxStake } from '@web/lib/sports/live-pick'
import { formatCredits, formatOdds } from '@web/lib/sports/format'
import { totalReturn } from '@web/lib/sports/odds'
import type { LiveSelection } from '@web/lib/sports/live/types'

const SETTLE_MS = 1800
type Signed = { offer: TestOffer; token: string; minStake: number; maxStake: number }
export type LivePickSelection = { eventId: string; home: string; away: string; sport: string; side: LiveSelection; price: number }
type Props = { selectedSide?: LiveSelection; selectedPrice?: number; onAcceptPrice?: (price: number) => void; onBusyChange?: (busy: boolean) => void; onDraft?: (draft: { stake: number; toWin: number | null }) => void; busy?: boolean; demo?: boolean; leagueId: string; eventId: string; home: string; away: string; sport: string; credits: number; startingCredits: number; maxStakePct: number; onPlaced: () => void }

/** In-play pick for a tracked game. The price shown is the live fair price; the server re-checks the game and price for a few seconds before it accepts. */
export function LivePickPanel({ leagueId, eventId, home, away, sport, credits, startingCredits, maxStakePct, onPlaced, selectedSide, selectedPrice, onAcceptPrice, onBusyChange, onDraft, demo }: Props) {
  const { toast } = useToast()
  const { view, elapsedMs } = useLiveGame(eventId, true)
  const [localSide, setSide] = useState<LiveSelection | null>(null)
  const side = selectedSide ?? localSide
  const [stake, setStake] = useState('')
  const [phase, setPhase] = useState<'idle' | 'checking'>('idle')
  const [left, setLeft] = useState(0)
  const [message, setMessage] = useState('')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearInterval(timer.current), [])
  useEffect(() => { onBusyChange?.(phase === 'checking'); return () => onBusyChange?.(false) }, [phase, onBusyChange])

  let offer: TestOffer | null = null
  try { if (view) { const aged = ageView(view, elapsedMs); offer = testOffer(aged, Date.parse(aged.serverTime)) } } catch { /* A stale or paused feed offers nothing to pick. */ }

  const max = Math.min(liveMaxStake(startingCredits, maxStakePct), credits)
  const amount = Math.floor(Number(stake.replace(/[^\d]/g, '')) || 0)
  const currentPrice = offer && side ? offer.prices[side] ?? null : null
  const price = selectedPrice ?? currentPrice
  const moved = selectedPrice != null && currentPrice != null && selectedPrice !== currentPrice
  // While the quote is moving, show what the stake would win at the live price; the ticket re-prices to it once it settles.
  const shownPrice = moved ? currentPrice : price
  const toWin = shownPrice != null && amount > 0 ? totalReturn(amount, shownPrice) - amount : 0
  const dir = moved && selectedPrice != null && currentPrice != null ? (currentPrice > selectedPrice ? 'up' : 'down') : undefined
  // Follow the feed: after the price holds still for a moment the ticket adopts it (Lock stays greyed until then). Never while a pick is being checked.
  useEffect(() => {
    if (!moved || currentPrice == null || phase === 'checking') return
    const settle = window.setTimeout(() => onAcceptPrice?.(currentPrice), SETTLE_MS)
    return () => window.clearTimeout(settle)
  }, [moved, currentPrice, phase, onAcceptPrice])
  useEffect(() => { onDraft?.({ stake: side ? amount : 0, toWin: side && amount > 0 && price != null ? toWin : null }) }, [onDraft, side, amount, price, toWin])
  const valid = amount >= 10 && amount <= max
  const names: Record<LiveSelection, string> = { home, away, draw: 'Draw' }
  const order: LiveSelection[] = sport === 'mls' ? ['away', 'draw', 'home'] : ['away', 'home']

  // No fresh quote: the ticket stays exactly as it is and Lock greys out while the price reprices.
  const repricing = !view || !offer

  async function lockIn() {
    if (!side || price == null || !valid || moved || phase === 'checking') return
    setMessage('')
    setPhase('checking'); setLeft(LIVE_TEST.holdMaxMs / 1000)
    window.clearInterval(timer.current)
    timer.current = window.setInterval(() => setLeft(n => Math.max(0, n - 1)), 1000)
    try {
      if (demo) {
        await new Promise(r => window.setTimeout(r, 2500))
        if (offer && offer.prices[side] !== price) throw new Error('The price moved while we checked. Review it and try again.')
        toast(`Sample live pick locked: ${names[side]} ${formatOdds(price)} (play cash, nothing real)`, 'success')
        setStake(''); setSide(null)
        onPlaced()
        return
      }
      const got = await fetch(`/api/sports/leagues/${leagueId}/live/${eventId}`, { cache: 'no-store' })
      const signed = (await got.json()) as Signed & { error?: string }
      if (!got.ok) throw new Error(signed.error ?? 'Live picks are unavailable right now.')
      const fresh = signed.offer.prices[side]
      if (fresh == null || fresh !== price) throw new Error(`The price moved to ${fresh == null ? 'n/a' : formatOdds(fresh)}. Review it and try again.`)
      const res = await fetch(`/api/sports/leagues/${leagueId}/live/${eventId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: signed.token, selection: side, stake: amount, expectedPrice: price }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Live pick not accepted. Try again.')
      toast(`Live pick locked: ${names[side]} ${formatOdds(data.pick.price)}`, 'success')
      setStake(''); setSide(null)
      onPlaced()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Live pick not accepted. Try again.')
    } finally {
      window.clearInterval(timer.current); setPhase('idle')
    }
  }

  const busy = phase === 'checking'
  const hold = repricing || moved
  const cap = max
  const quick = [10, Math.round(cap / 4), Math.round(cap / 2), cap]
  const problem = amount === 0 ? null : amount < 10 ? 'Minimum is $10' : amount > max ? (amount > credits ? 'Not enough cash' : `Maximum per live pick is ${formatCredits(max)}`) : null
  const prices = offer?.prices
  return <form className="sp-live-pick" aria-busy={busy || hold || undefined} onSubmit={e => { e.preventDefault(); void lockIn() }}>
    {selectedSide == null && prices ? <div className="sp-live-pick-sides" role="radiogroup" aria-label="Live pick side">
      {order.map(s => {
        const p = prices[s]
        return p == null ? null : <button key={s} type="button" role="radio" aria-checked={side === s} className="sp-live-pick-side" data-on={side === s || undefined} disabled={busy} onClick={() => setSide(s)}><span>{names[s]}</span><b className="numeric">{formatOdds(p)}</b></button>
      })}
    </div> : null}
    {moved ? <p className="sp-odds-moved" data-dir={dir} role="status" aria-live="polite"><Zap aria-hidden /> <span>Odds moved <b className="numeric">{formatOdds(selectedPrice!)}</b> → <b className="numeric">{formatOdds(currentPrice!)}</b>. Updating your ticket…</span></p> : null}
    <div>
      <label className="fw-label" htmlFor={`lp-${eventId}`}>Stake (play cash)</label>
      <input id={`lp-${eventId}`} className="fw-input numeric" inputMode="numeric" autoComplete="off" placeholder={`${formatCredits(10)} to ${formatCredits(max)}`} value={stake} disabled={busy} aria-invalid={problem ? true : undefined} aria-describedby={`lp-hint-${eventId}`} onChange={e => setStake(e.target.value)} />
      <p className="fw-hint" id={`lp-hint-${eventId}`} role={problem ? 'alert' : undefined}>
        {problem ? <span className="fw-bad">{problem}</span> : <span>Max {formatCredits(max)} per live pick · up to {LIVE_PICK.maxPerEvent} per game</span>}
      </p>
    </div>
    <div className="fw-quick">
      {quick.map((v, i) => <button key={i} type="button" disabled={busy || v < 10 || max < 10} aria-label={i === 3 ? `Stake the maximum, ${formatCredits(cap)} cash` : `Stake ${formatCredits(v)} cash`} onClick={() => setStake(String(Math.max(v, 10)))}>{i === 3 ? 'Max' : formatCredits(v)}</button>)}
    </div>
    <div className="sp-slip-return" aria-live="polite" data-dir={dir}>
      <span className="fw-label" style={{ margin: 0 }}>To win</span>
      {amount > 0 && !problem && shownPrice != null ? <b key={shownPrice}>{formatCredits(toWin)}</b> : <span className="sp-slip-hint">Enter a stake</span>}
    </div>
    {message ? <p className="sp-slip-moved" role="alert">{message}</p> : null}
    <button type="submit" className="fw-submit sp-live-pick-go" disabled={busy || hold || !side || !valid} aria-busy={busy || hold || undefined} data-updating={hold || undefined}>
      {busy || hold ? <span className="spin" aria-hidden /> : null}
      {busy ? `Checking… up to ${left}s` : repricing ? 'Repricing…' : moved ? 'Odds updating…' : 'Lock in live pick'}
    </button>
    <p className="sp-fine" role="status" aria-live="polite">{busy ? 'We re-check the score and price for a few seconds (at most 9). If the game or the price moves, nothing is placed and no cash is taken.' : repricing ? 'Waiting for a fresh score and price. Lock turns back on as soon as the market is steady.' : demo ? 'Sample game · play cash only. Prices move like a real game.' : 'Play money only, nothing real is at stake. Priced from the live market and locked when you confirm.'}</p>
  </form>
}


export function LivePickSlip({ selection, onClear, onMinimize, onAcceptPrice, onBusyChange, ...props }: Omit<Props, 'eventId' | 'home' | 'away' | 'sport' | 'selectedSide' | 'selectedPrice'> & { selection: LivePickSelection; onClear: () => void; onMinimize?: () => void }) {
  const busy = props.busy ?? false
  const name = selection.side === 'draw' ? 'Draw' : selection.side === 'home' ? selection.home : selection.away
  const colors = matchupColors(selection.sport, selection.away, selection.home)
  const color = selection.side === 'home' ? colors[1] : selection.side === 'away' ? colors[0] : '#64748b'
  return <section className="fw-panel fw-trade sp-slip sp-sheet sp-live-slip" data-open="" data-themed="" style={{ '--tc': color, '--tc-ink': onColor(color) } as React.CSSProperties} aria-labelledby="sp-live-slip-title" aria-busy={busy || undefined}>
    {onMinimize ? <SheetHandle onMinimize={onMinimize} disabled={busy} /> : null}
    <div className="fw-section-head"><h2 id="sp-live-slip-title">Pick slip</h2><button type="button" className="sp-clear" aria-label="Clear live pick slip" disabled={busy} onClick={onClear}><X aria-hidden />Clear</button></div>
    <div className="sp-slip-pick"><div className="sp-slip-top" data-accent={color}>
      {selection.side !== 'draw' && selection.sport !== 'tennis' ? <span className="sp-slip-watermark" aria-hidden><TeamBadge sport={selection.sport} name={name} size={144} /></span> : null}
      {selection.side !== 'draw' ? <TeamBadge sport={selection.sport} name={name} size={48} /> : <span className="sp-slip-sport">Draw</span>}
      <div><small>Live · Winner</small><strong>{name}</strong></div>
      <span className="sp-slip-odds"><LiveNumber value={selection.price} format={formatOdds} kind="price" chip={false} /></span>
    </div><span className="sp-slip-game">{selection.away} @ {selection.home} · live price, re-checked before it locks</span></div>
    <LivePickPanel {...props} eventId={selection.eventId} home={selection.home} away={selection.away} sport={selection.sport} selectedSide={selection.side} selectedPrice={selection.price} onAcceptPrice={onAcceptPrice} onBusyChange={onBusyChange} />
  </section>
}
