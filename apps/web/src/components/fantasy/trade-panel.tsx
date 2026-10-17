"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Wallet } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Slider } from "@web/components/ui/slider"
import { useConfirm } from "@web/components/ui/confirm"
import { useToast } from "@web/components/ui/toast"
import { TickerCombobox } from "@web/components/fantasy/ticker-combobox"
import { TradeReceipt, type Receipt } from "@web/components/fantasy/trade-receipt"
import { fillsAtOpen } from "@web/lib/fantasy-rules"
import { formatCurrency } from "@web/lib/format"
import { amountFromFraction, BUY_SPOTS, checkTradeInput, estimateShares, sanitizeAmount, SELL_SPOTS, snapFraction, snapThreshold } from "@web/lib/trade-input"
import { mutate } from "@web/lib/use-api"
import "@web/components/fantasy/season/fantasy-season.css"

type Held = { ticker: string; shares: number; value: number; averageCost: number }
type Quote = { symbol: string; name: string | null; price: number; asOf: string; live?: boolean }
type Lookup =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; quote: Quote }
  | { state: "missing"; message: string }

const HYPE = ["NVDA", "TSLA", "AAPL", "PLTR", "GME", "SPY"]

const fmtShares = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 4 })
const asOfLabel = (asOf: string) => new Date(`${asOf.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })

/**
 * Buy by dollars, sell by shares. While the market is open it fills at the live
 * price the form shows; while it's closed the order queues and fills at the
 * first live price after the open.
 */
export function TradePanel({ leagueId, cash, positions, onTraded, closed = false, allowNote = false }: { leagueId: string; cash: number; positions: Held[]; onTraded: () => void; closed?: boolean; allowNote?: boolean }) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [symbol, setSymbol] = useState("")
  const [amount, setAmount] = useState("")
  const [pending, setPending] = useState(false)
  const [cashingOut, setCashingOut] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const closeReceipt = useCallback(() => setReceipt(null), [])
  const [touched, setTouched] = useState(false)
  const [why, setWhy] = useState("")
  const [whyOpen, setWhyOpen] = useState(false)
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" })

  const ticker = symbol.trim().toUpperCase()
  const held = positions.find((p) => p.ticker === ticker)
  const check = checkTradeInput(side, ticker, amount, { cash, heldShares: held?.shares ?? null })
  const problem = touched && !check.ok ? check.message : null
  // Worked out each render, so a page left open across 9:30 or 4:00 ET catches up on its next refresh.
  // Only a label: the server decides whether an order fills now or queues.
  const queues = fillsAtOpen("stock")

  // Show what you'd be trading at before you commit. Debounced, and a slow
  // response for an old ticker can never overwrite the one on screen.
  useEffect(() => {
    if (!ticker) {
      setLookup({ state: "idle" })
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    setLookup({ state: "loading" })
    // A 429 is the provider's budget running out for a moment (often on a half-typed ticker),
    // not an answer about this ticker: keep "Looking up…" and ask again shortly.
    const look = async (retries: number) => {
      try {
        const response = await fetch(`/api/market/quote?symbol=${encodeURIComponent(ticker)}&kind=stock`)
        const body = await response.json().catch(() => ({}))
        if (cancelled) return
        if (response.status === 429 && retries > 0) {
          timer = setTimeout(() => look(retries - 1), 2500)
          return
        }
        setLookup(
          response.ok
            ? { state: "found", quote: body as Quote }
            : { state: "missing", message: (body as { error?: string }).error ?? "Couldn't look that up." },
        )
      } catch {
        if (!cancelled) setLookup({ state: "missing", message: "Couldn't reach the price service. Try again." })
      }
    }
    timer = setTimeout(() => look(2), 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [ticker])

  const quote = lookup.state === "found" ? lookup.quote : null
  const estimated = side === "buy" && check.ok && typeof check.value === "number" ? estimateShares(check.value, quote?.price ?? null) : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (closed) return
    setTouched(true)
    if (!check.ok) return
    if (lookup.state === "missing") return

    setPending(true)
    try {
      const note = allowNote ? why.trim() || undefined : undefined
      const body = side === "buy" ? { side, symbol: ticker, amount: check.value, note } : { side, symbol: ticker, shares: check.value, note }
      const result = await mutate<{ queued: true; why: "closed" | "no-live-price"; ticker: string } | { queued?: undefined; ticker: string; shares: number; price: number }>(`/api/fantasy/${leagueId}/trade`, { body })
      if (result.queued) {
        setReceipt({ id: Date.now(), side, ticker: result.ticker, shares: 0, price: 0, averageCost: null, isNew: false, queued: true })
        toast(
          result.why === "closed"
            ? `${side === "buy" ? "Buy" : "Sell"} of ${result.ticker} queued. It fills at the live price after the market opens.`
            : `We couldn't get a live price for ${result.ticker} just now, so your ${side} is queued and fills as soon as we do.`,
          "success",
        )
        setAmount("")
        setTouched(false)
        setWhy("")
        setWhyOpen(false)
        onTraded()
        return
      }
      // The receipt is the confirmation (it speaks to screen readers too), so success needs no toast.
      setReceipt({ id: Date.now(), side, ticker: result.ticker, shares: result.shares, price: result.price, averageCost: held?.averageCost ?? null, isNew: !held })
      try {
        navigator.vibrate?.(side === "buy" ? 18 : [12, 40, 12])
      } catch {
        // No haptics here; nothing to do.
      }
      setAmount("")
      setTouched(false)
      setWhy("")
      setWhyOpen(false)
      onTraded()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Trade failed.", "error")
    } finally {
      setPending(false)
    }
  }

  // Sells every holding through the same endpoint a single sell uses, one after
  // another, so one bad ticker can't sink the rest. The list refreshes once at the end.
  async function sellAll() {
    if (cashingOut || positions.length === 0) return
    const total = positions.reduce((sum, p) => sum + p.value, 0)
    const ok = await confirm({
      title: "Cash out everything? 🏦",
      description: `That's all ${positions.length} ${positions.length === 1 ? "holding" : "holdings"}, about ${formatCurrency(total)}. ${queues ? "The market's closed, so these queue and fill after the open." : "They fill at live prices."} No more diamond hands. Play money only.`,
      confirmLabel: "Sell it all 💸",
      tone: "danger",
    })
    if (!ok) return

    setCashingOut(true)
    let sold = 0
    let queuedCount = 0
    const failed: string[] = []
    let firstError = ""
    for (const p of positions) {
      try {
        const result = await mutate<{ queued?: true }>(`/api/fantasy/${leagueId}/trade`, { body: { side: "sell", symbol: p.ticker, shares: "all" } })
        if (result.queued) queuedCount += 1
        else sold += 1
      } catch (error) {
        failed.push(p.ticker)
        firstError ||= error instanceof Error ? error.message : "Trade failed."
      }
    }
    setCashingOut(false)
    if (sold + queuedCount > 0) {
      setAmount("")
      setTouched(false)
      onTraded()
      try {
        navigator.vibrate?.([12, 40, 12, 40, 12])
      } catch {
        // No haptics here; nothing to do.
      }
    }
    if (failed.length === 0) {
      toast(queuedCount > 0 ? `Cash-out queued for ${queuedCount} ${queuedCount === 1 ? "holding" : "holdings"}. Fills after the open.` : "Cashed out! Every position is sold and you're ready for the next big thing.", "success")
    } else {
      toast(`${failed.join(", ")} didn't sell: ${firstError} The rest went through, so try those again.`, "error")
    }
  }

  return (
    <section className="fw-panel fw-trade" data-closed={closed || undefined} aria-labelledby="fw-trade-title">
      {receipt ? <TradeReceipt receipt={receipt} onDone={closeReceipt} /> : null}
      <div className="fw-section-head">
        <h2 id="fw-trade-title">Make a move</h2>
        <span className="fw-tag">{closed ? "Closed" : "Play money"}</span>
      </div>
      {closed ? <p className="fw-closed-note">League closed. Final standings are locked, so trading is off.</p> : null}
      <form onSubmit={submit} noValidate inert={closed || undefined}>
        <div className="fw-seg" role="tablist" aria-label="Buy or sell" data-side={side}>
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={side === s}
              onClick={() => { setSide(s); setAmount(""); setTouched(false) }}
            >
              {s}
            </button>
          ))}
        </div>
        <div>
          <span className="fw-label" aria-hidden>{side === "buy" ? "Stock or fund" : "Position to sell"}</span>
          <TickerCombobox
            value={symbol}
            onChange={setSymbol}
            local={side === "sell" ? positions.map((p) => ({ symbol: p.ticker, name: null, detail: `You hold ${fmtShares(p.shares)} sh` })) : undefined}
            className="fw-input fw-ticker"
          />
          <p className="fw-hint numeric" aria-live="polite">
            {lookup.state === "loading"
              ? "Looking up…"
              : quote
                ? `${quote.name ?? quote.symbol} · ${formatCurrency(quote.price)} ${quote.live ? "live price" : `at the ${asOfLabel(quote.asOf)} close`}`
                : lookup.state === "missing"
                  ? <span className="fw-bad">{lookup.message}</span>
                  : null}
          </p>
        </div>
        <div className="fw-tickers">
          {(side === "buy" ? HYPE : positions.map((p) => p.ticker)).slice(0, 6).map((t) => (
            <button key={t} type="button" className="fw-tick" aria-pressed={ticker === t} onClick={() => setSymbol(t)}>
              {t}
            </button>
          ))}
        </div>

        <div>
          <span className="fw-label" aria-hidden>{side === "buy" ? "Amount to invest" : "Shares to sell"}</span>
          <div className="fw-money">
            <span>{side === "buy" ? "$" : "sh"}</span>
            <input
              className="fw-input"
              aria-label={side === "buy" ? "Amount in dollars" : "Shares to sell"}
              aria-invalid={problem ? true : undefined}
              inputMode="decimal"
              autoComplete="off"
              value={amount === "all" ? "All" : amount}
              onChange={(e) => setAmount(sanitizeAmount(e.target.value, side === "buy" ? 2 : 4))}
              placeholder="0"
            />
          </div>
          <p className="fw-hint numeric" aria-live="polite">
            {problem ? (
              <span className="fw-bad">{problem}</span>
            ) : estimated !== null ? (
              `≈ ${fmtShares(estimated)} shares of ${ticker}${queues ? " at the last close; the open sets the count" : ""}`
            ) : side === "buy" ? (
              `${formatCurrency(cash)} available`
            ) : held ? (
              `You hold ${fmtShares(held.shares)} sh (${formatCurrency(held.value)})`
            ) : (
              "Pick something you own"
            )}
          </p>
        </div>
        <AmountSlider
          side={side}
          max={side === "buy" ? cash : held?.shares ?? 0}
          amount={amount}
          onChange={setAmount}
        />
        {allowNote ? (
        <div className="fs-why-field">
          {whyOpen ? (
            <>
              <input className="fw-input fs-why" value={why} maxLength={280} onChange={(e) => setWhy(e.target.value)} placeholder="Why this one? Your league will see it." aria-label="Why are you making this move?" />
              <span className="fs-count numeric">{why.length}/280</span>
            </>
          ) : (
            <button type="button" className="fs-add-note" onClick={() => setWhyOpen(true)}>
              Add why (optional)
            </button>
          )}
        </div>
        ) : null}
        <button type="submit" className="fw-submit" data-side={side} disabled={pending || cashingOut} aria-busy={pending || undefined}>
          {pending ? <span className="spin" aria-hidden /> : null}
          {pending ? "Placing order…" : side === "buy" ? (queues ? "Queue buy" : "Buy") : queues ? "Queue sell" : "Sell"}
        </button>
        {side === "sell" ? (
          <Button
            type="button"
            variant="outline"
            className="fw-cash-out group w-full"
            loading={cashingOut}
            disabled={positions.length === 0 || pending}
            onClick={sellAll}
          >
            {cashingOut ? "Cashing out…" : positions.length === 0 ? "Nothing to cash out yet" : (
              <>
                <Wallet aria-hidden />
                Cash out everything
              </>
            )}
          </Button>
        ) : null}
        <p className="fw-note">
          {queues
            ? "The market's closed, so this waits and fills at the live price after the 9:30am ET open. You can cancel it until then."
            : "Fills at the live price shown."}{" "}
          Play money only.
        </p>
      </form>
    </section>
  )
}

const SPOT_LABEL: Record<"buy" | "sell", Record<number, string>> = {
  buy: { 0.1: "10%", 0.25: "25%", 0.5: "50%", 1: "Max" },
  sell: { 0.25: "25%", 0.5: "50%", 0.75: "75%", 1: "All" },
}

/**
 * Dollars of buying power when buying, shares held when selling. The track is the
 * shadcn/Radix Slider; hotspots are the old quick-picks, and the thumb snaps onto
 * one when it gets close.
 */
function AmountSlider({ side, max, amount, onChange }: { side: "buy" | "sell"; max: number; amount: string; onChange: (next: string) => void }) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const caught = useRef<number | null>(null)
  const pointerDown = useRef(false)
  const spots = side === "buy" ? BUY_SPOTS : SELL_SPOTS
  const usable = max > 0
  const typed = amount === "all" ? 1 : max > 0 ? (Number(amount) || 0) / max : 0
  const fraction = Math.min(1, Math.max(0, Number.isFinite(typed) ? typed : 0))
  // An over-budget amount sits at the end of the track, but it is not "Max" or "All".
  const active = typed <= 1.005 ? spots.find((spot) => Math.abs(fraction - spot) <= 0.005) : undefined

  const valueNow = amount === "all" ? max : Number(amount) || 0
  const valueText = !usable
    ? side === "buy" ? "No buying power" : "No shares"
    : side === "buy"
      ? formatCurrency(valueNow)
      : amount === "all"
        ? `All ${fmtShares(max)} shares`
        : `${fmtShares(valueNow)} shares`
  const bubbleText = !usable ? "" : side === "buy" ? formatCurrency(valueNow) : amount === "all" ? "All" : fmtShares(valueNow)

  function change([tick]: number[]) {
    if (!usable || tick === undefined) return
    // Snapping is for dragging. A key press moves one step (1%), which a snap zone would swallow.
    if (!pointerDown.current) {
      const fractionNow = tick / 1000
      const onSpot = spots.some((spot) => Math.abs(spot - fractionNow) < 1e-9)
      onChange(amountFromFraction(side, fractionNow, max, onSpot))
      return
    }
    const width = rootRef.current?.getBoundingClientRect().width ?? 280
    const snapped = snapFraction(tick / 1000, spots, snapThreshold(width), caught.current)
    caught.current = snapped.snapped ? snapped.fraction : null
    onChange(amountFromFraction(side, snapped.fraction, max, snapped.snapped))
  }

  return (
    <div className="fw-allocation">
      <div className="fw-allocation-head"><span>{side === "buy" ? "Buying power" : "Position size"}</span><span className="numeric">{Math.round(fraction * 100)}%</span></div>
      <Slider
        ref={rootRef}
        aria-label={side === "buy" ? "Buying power" : "Shares to sell"}
        min={0}
        max={1000}
        step={10}
        value={[Math.round(fraction * 1000)]}
        disabled={!usable}
        onValueChange={change}
        onPointerDown={() => {
          pointerDown.current = true
          const release = () => {
            pointerDown.current = false
            caught.current = null
            window.removeEventListener("pointerup", release)
            window.removeEventListener("pointercancel", release)
          }
          window.addEventListener("pointerup", release)
          window.addEventListener("pointercancel", release)
        }}
        thumbLabel={valueText}
        bubble={bubbleText}
        ticks={spots}
        activeTick={active}
        className="px-1"
      />
      <div className="fw-amount-picks">
        {spots.map((spot) => (
          <button key={spot} type="button" disabled={!usable}
            aria-pressed={active === spot}
            onClick={() => onChange(amountFromFraction(side, spot, max, true))}
            className="fw-amount-pick">
            {SPOT_LABEL[side][spot]}
          </button>
        ))}
      </div>
    </div>
  )
}
