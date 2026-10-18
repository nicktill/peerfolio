"use client"

import { useEffect, useRef, useState } from 'react'
import { Zap, X } from 'lucide-react'
import { TeamBadge } from './team-badge'
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

  if (!view || !offer) {
    return <div className="sp-live-pick" data-paused><p className="sp-fine" role="status"><Zap aria-hidden /> {view ? 'Live picks are paused until the live score and market price are fresh again.' : 'Checking live pick availability…'}</p></div>
  }

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
  return <div className="sp-live-pick" aria-busy={busy || undefined}>
    <div className="sp-live-pick-head"><b><Zap aria-hidden /> Live pick</b><span className="sp-fine">Up to {LIVE_PICK.maxPerEvent} per game</span></div>
    {selectedSide == null ? <div className="sp-live-pick-sides" role="radiogroup" aria-label="Live pick side">
      {order.map(s => {
        const p = offer.prices[s]
        return p == null ? null : <button key={s} type="button" role="radio" aria-checked={side === s} className="sp-live-pick-side" data-on={side === s || undefined} disabled={busy} onClick={() => setSide(s)}><span>{names[s]}</span><b className="numeric">{formatOdds(p)}</b></button>
      })}
    </div> : null}
    {moved ? <p className="sp-odds-moved" data-dir={dir} role="status" aria-live="polite"><Zap aria-hidden /> <span>Odds moved <b className="numeric">{formatOdds(selectedPrice!)}</b> → <b className="numeric">{formatOdds(currentPrice!)}</b>. Updating your ticket…</span></p> : null}
    <div className="sp-live-pick-stake">
      <label htmlFor={`lp-${eventId}`} className="sp-fine">Stake</label>
      <input id={`lp-${eventId}`} className="fw-input numeric" inputMode="numeric" autoComplete="off" placeholder={`10 to ${max}`} value={stake} disabled={busy} onChange={e => setStake(e.target.value)} />
      <button type="button" className="fw-btn" disabled={busy || max < 10} onClick={() => setStake(String(max))}>Max</button>
      <span className="sp-fine numeric" data-dir={dir}>To win <b key={shownPrice ?? 0}>{formatCredits(toWin)}</b></span>
    </div>
    <button type="button" className="fw-btn sp-live-pick-go" data-solid disabled={busy || !side || !valid || moved} aria-busy={moved || undefined} data-updating={moved || undefined} onClick={() => void lockIn()}>{busy ? `Checking… up to ${left}s` : moved ? 'Odds updating…' : 'Lock in live pick'}</button>
    <p className="sp-fine" role="status" aria-live="polite">{busy ? 'We re-check the score and price for a few seconds (at most 9). If the game or the price moves, nothing is placed and no cash is taken.' : message || (demo ? 'Sample game · play cash only. Prices move like a real game.' : max < 10 ? 'Not enough cash for a live pick.' : `Stake 10 to ${formatCredits(max)}. Priced from the live market; locked when you confirm.`)}</p>
  </div>
}


export function LivePickSlip({ selection, onClear, onMinimize, onAcceptPrice, onBusyChange, ...props }: Omit<Props, 'eventId' | 'home' | 'away' | 'sport' | 'selectedSide' | 'selectedPrice'> & { selection: LivePickSelection; onClear: () => void; onMinimize?: () => void }) {
  const busy = props.busy ?? false
  const name = selection.side === 'draw' ? 'Draw' : selection.side === 'home' ? selection.home : selection.away
  const colors = matchupColors(selection.sport, selection.away, selection.home)
  const color = selection.side === 'home' ? colors[1] : selection.side === 'away' ? colors[0] : '#64748b'
  return <section className="fw-panel fw-trade sp-slip sp-sheet sp-live-slip" data-open="" data-themed="" style={{ '--tc': color } as React.CSSProperties} aria-labelledby="sp-live-slip-title" aria-busy={busy || undefined}>
    {onMinimize ? <SheetHandle onMinimize={onMinimize} disabled={busy} /> : null}
    <div className="fw-section-head"><h2 id="sp-live-slip-title">Pick slip</h2><button type="button" className="sp-clear" aria-label="Clear live pick slip" disabled={busy} onClick={onClear}><X aria-hidden />Clear</button></div>
    <div className="sp-slip-pick"><div className="sp-slip-top" data-accent={color}>
      {selection.side !== 'draw' ? <TeamBadge sport={selection.sport} name={name} size={44} /> : null}
      <div><small>Live · Winner</small><strong>{name}</strong></div><span className="pl-odds">{formatOdds(selection.price)}</span>
    </div><span className="sp-slip-game">{selection.away} @ {selection.home} · price checked before acceptance</span></div>
    <LivePickPanel {...props} eventId={selection.eventId} home={selection.home} away={selection.away} sport={selection.sport} selectedSide={selection.side} selectedPrice={selection.price} onAcceptPrice={onAcceptPrice} onBusyChange={onBusyChange} />
  </section>
}
