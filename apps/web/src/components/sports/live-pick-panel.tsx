"use client"

import { useEffect, useRef, useState } from 'react'
import { Zap } from 'lucide-react'
import { useLiveGame } from './live-game'
import { useToast } from '@web/components/ui/toast'
import { ageView } from '@web/lib/sports/live/view'
import { LIVE_TEST, testOffer, type TestOffer } from '@web/lib/sports/live-test'
import { LIVE_PICK, liveMaxStake } from '@web/lib/sports/live-pick'
import { formatCredits, formatOdds } from '@web/lib/sports/format'
import { totalReturn } from '@web/lib/sports/odds'
import type { LiveSelection } from '@web/lib/sports/live/types'

type Signed = { offer: TestOffer; token: string; minStake: number; maxStake: number }
type Props = { leagueId: string; eventId: string; home: string; away: string; sport: string; credits: number; startingCredits: number; maxStakePct: number; onPlaced: () => void }

/** In-play pick for a tracked game. The price shown is the live fair price; the server re-checks the game for 12 seconds before it accepts. */
export function LivePickPanel({ leagueId, eventId, home, away, sport, credits, startingCredits, maxStakePct, onPlaced }: Props) {
  const { toast } = useToast()
  const { view, elapsedMs } = useLiveGame(eventId, true)
  const [side, setSide] = useState<LiveSelection | null>(null)
  const [stake, setStake] = useState('')
  const [phase, setPhase] = useState<'idle' | 'checking'>('idle')
  const [left, setLeft] = useState(0)
  const [message, setMessage] = useState('')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearInterval(timer.current), [])

  let offer: TestOffer | null = null
  try { if (view) { const aged = ageView(view, elapsedMs); offer = testOffer(aged, Date.parse(aged.serverTime)) } } catch { /* A stale or paused feed offers nothing to pick. */ }

  const max = Math.min(liveMaxStake(startingCredits, maxStakePct), credits)
  const amount = Math.floor(Number(stake.replace(/[^\d]/g, '')) || 0)
  const price = offer && side ? offer.prices[side] ?? null : null
  const toWin = price != null && amount > 0 ? totalReturn(amount, price) - amount : 0
  const valid = amount >= 10 && amount <= max
  const names: Record<LiveSelection, string> = { home, away, draw: 'Draw' }
  const order: LiveSelection[] = sport === 'mls' ? ['away', 'draw', 'home'] : ['away', 'home']

  if (!view || !offer) {
    return <div className="sp-live-pick" data-paused><p className="sp-fine" role="status"><Zap aria-hidden /> {view ? 'Live picks are paused until the live score and market price are fresh again.' : 'Checking live pick availability…'}</p></div>
  }

  async function lockIn() {
    if (!side || price == null || !valid || phase === 'checking') return
    setMessage('')
    setPhase('checking'); setLeft(LIVE_TEST.delayMs / 1000)
    window.clearInterval(timer.current)
    timer.current = window.setInterval(() => setLeft(n => Math.max(0, n - 1)), 1000)
    try {
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
    <div className="sp-live-pick-head"><b><Zap aria-hidden /> Live pick</b><span className="sp-fine">Counts in the league · up to {LIVE_PICK.maxPerEvent} per game</span></div>
    <div className="sp-live-pick-sides" role="radiogroup" aria-label="Live pick side">
      {order.map(s => {
        const p = offer.prices[s]
        return p == null ? null : <button key={s} type="button" role="radio" aria-checked={side === s} className="sp-live-pick-side" data-on={side === s || undefined} disabled={busy} onClick={() => setSide(s)}><span>{names[s]}</span><b className="numeric">{formatOdds(p)}</b></button>
      })}
    </div>
    <div className="sp-live-pick-stake">
      <label htmlFor={`lp-${eventId}`} className="sp-fine">Stake</label>
      <input id={`lp-${eventId}`} className="fw-input numeric" inputMode="numeric" autoComplete="off" placeholder={`10 to ${max}`} value={stake} disabled={busy} onChange={e => setStake(e.target.value)} />
      <button type="button" className="fw-btn" disabled={busy || max < 10} onClick={() => setStake(String(max))}>Max</button>
      <span className="sp-fine numeric">To win <b>{formatCredits(toWin)}</b></span>
    </div>
    <button type="button" className="fw-btn sp-live-pick-go" data-solid disabled={busy || !side || !valid} onClick={() => void lockIn()}>{busy ? `Checking the game… ${left}s` : 'Lock in live pick'}</button>
    <p className="sp-fine" role="status" aria-live="polite">{busy ? 'We re-check the score and price for 12 seconds. If the game changes, nothing is placed and no cash is taken.' : message || (max < 10 ? 'Not enough cash for a live pick.' : `Stake 10 to ${formatCredits(max)}. Priced from the live market; locked when you confirm.`)}</p>
  </div>
}
