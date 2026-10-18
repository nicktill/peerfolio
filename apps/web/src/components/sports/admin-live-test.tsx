"use client"

import { useEffect, useState } from 'react'
import { useLiveGame } from './live-game'
import { ageView } from '@web/lib/sports/live/view'
import { LIVE_TEST, testOffer, type TestOffer, type TestReceipt } from '@web/lib/sports/live-test'
import type { LiveSelection } from '@web/lib/sports/live/types'

type SignedOffer = { offer: TestOffer; token: string }
type Receipt = TestReceipt & { id: string }
const odds = (price: number) => `${price > 0 ? '+' : ''}${price}`

/** Mount only for real tracked games, never a sample preview. Server repeats admin checks on every request. */
export function AdminLiveTestPanel({ eventId, home, away }: { eventId: string; home: string; away: string }) {
  const [admin, setAdmin] = useState(false)
  const [opened, setOpened] = useState(false)
  const [offer, setOffer] = useState<SignedOffer | null>(null)
  const [stake, setStake] = useState(10)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<Receipt[]>([])
  const { view, elapsedMs } = useLiveGame(eventId, admin)
  const historyKey = `peerfolio:admin-paper-tests:${eventId}`
  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/sports/live-test', { cache: 'no-store', signal: controller.signal }).then(async res => {
      if (!res.ok) return
      const data = await res.json()
      if (!controller.signal.aborted) setAdmin(data.enabled === true)
    }).catch(() => {})
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!admin) return
    try { const stored: unknown = JSON.parse(localStorage.getItem(historyKey) ?? '[]'); if (Array.isArray(stored)) setHistory(stored.slice(0, 20) as Receipt[]) } catch { /* Browser history is optional. */ }
  }, [admin, historyKey])
  let usable = false
  try { if (view) { const aged = ageView(view, elapsedMs); testOffer(aged, Date.parse(aged.serverTime)); usable = true } } catch { /* A paused feed offers no test action. */ }
  if (!admin || (!usable && !opened)) return null

  async function refreshOffer() {
    setBusy(true); setMessage(''); setOffer(null)
    try {
      const response = await fetch(`/api/sports/live-test/${eventId}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to load test quote')
      setOffer(data)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load test quote') }
    finally { setBusy(false) }
  }
  async function submit(selection: LiveSelection, expectedPrice: number) {
    if (!offer || busy) return
    setBusy(true); setMessage('Checking new quote and score observations for 12 seconds…')
    try {
      const response = await fetch(`/api/sports/live-test/${eventId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: offer.token, selection, stake, expectedPrice }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Paper test rejected')
      const receipt = data as Receipt
      const next = [receipt, ...history].slice(0, 20)
      setHistory(next)
      try { localStorage.setItem(historyKey, JSON.stringify(next)) } catch { /* Receipt remains visible for this visit. */ }
      setMessage('Paper test accepted. League cash and standings are unchanged.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Paper test rejected') }
    finally { setOffer(null); setBusy(false) }
  }
  return <div className="sp-admin-live-test" style={{ borderTop: '1px solid var(--fw-border)', paddingTop: 12, marginTop: 10 }}>
    <button type="button" className="sp-market-select" aria-expanded={opened} onClick={() => setOpened(!opened)}>Admin · live paper test</button>
    {opened ? <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
      <p className="sp-fine">Private TEST · 12-second acceptance delay · no league balance, payouts or settlement. Receipts stay in this browser. Feed latency can still make a quote exploitable.</p>
      {!usable ? <p className="sp-fine" role="status">Test paused: a fresh live score and agreeing exchange quote are required.</p> : null}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="sp-fine">Test stake <input type="number" aria-label="Paper test stake" min={LIVE_TEST.minStake} max={LIVE_TEST.maxStake} step={1} value={stake} disabled={busy} onChange={e => setStake(Number(e.target.value))} style={{ width: 70, marginLeft: 8, background: 'var(--fw-panel)', border: '1px solid var(--fw-border)', borderRadius: 6, padding: 6 }}/></label>
        <button type="button" className="sp-market-select" disabled={!usable || busy} onClick={() => void refreshOffer()}>{busy ? 'Checking…' : 'Refresh test offer'}</button>
      </div>
      {offer && usable ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{(['away', 'draw', 'home'] as const).map(selection => {
        const price = offer.offer.prices[selection]
        return price == null ? null : <button key={selection} type="button" className="sp-market-select" disabled={busy} onClick={() => void submit(selection, price)}>{selection === 'home' ? home : selection === 'away' ? away : 'Draw'} · {odds(price)} · Test</button>
      })}</div> : null}
      <p className="sp-fine" role="status" aria-live="polite">{message}</p>
      {history.length ? <details><summary className="sp-fine">This browser · {history.length} accepted test receipts</summary><div style={{ maxHeight: 220, overflow: 'auto' }}>{history.map(item => <pre key={item.id} style={{ fontSize: 11, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(item, null, 2)}</pre>)}</div></details> : null}
    </div> : null}
  </div>
}
