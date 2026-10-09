"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import confetti from "canvas-confetti"
import { motion } from "motion/react"
import { Confetti, type ConfettiRef } from "@web/components/magicui/confetti"
import { Button } from "@web/components/ui/button"
import { Slider } from "@web/components/ui/slider"
import { ShimmerButton } from "@web/components/magicui/shimmer-button"
import { InteractiveHoverButton } from "@web/components/magicui/interactive-hover-button"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { useConfirm } from "@web/components/ui/confirm"
import { useToast } from "@web/components/ui/toast"
import { TickerCombobox } from "@web/components/fantasy/ticker-combobox"
import { TradeReceipt, type Receipt } from "@web/components/fantasy/trade-receipt"
import { fillsAtOpen } from "@web/lib/fantasy-rules"
import { formatCurrency } from "@web/lib/format"
import { amountFromFraction, BUY_SPOTS, checkTradeInput, estimateShares, sanitizeAmount, SELL_SPOTS, snapFraction, snapThreshold } from "@web/lib/trade-input"
import { mutate } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"

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
export function TradePanel({ leagueId, cash, positions, onTraded }: { leagueId: string; cash: number; positions: Held[]; onTraded: () => void }) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [symbol, setSymbol] = useState("")
  const [amount, setAmount] = useState("")
  const [pending, setPending] = useState(false)
  const [burst, setBurst] = useState(0)
  const confettiRef = useRef<ConfettiRef>(null)
  const cashButtonRef = useRef<HTMLButtonElement>(null)
  const [cashingOut, setCashingOut] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const closeReceipt = useCallback(() => setReceipt(null), [])
  const [touched, setTouched] = useState(false)
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
    setLookup({ state: "loading" })
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/market/quote?symbol=${encodeURIComponent(ticker)}&kind=stock`)
        const body = await response.json().catch(() => ({}))
        if (cancelled) return
        setLookup(
          response.ok
            ? { state: "found", quote: body as Quote }
            : { state: "missing", message: (body as { error?: string }).error ?? "Couldn't look that up." },
        )
      } catch {
        if (!cancelled) setLookup({ state: "missing", message: "Couldn't reach the price service. Try again." })
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [ticker])

  const quote = lookup.state === "found" ? lookup.quote : null
  const estimated = side === "buy" && check.ok && typeof check.value === "number" ? estimateShares(check.value, quote?.price ?? null) : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (!check.ok) return
    if (lookup.state === "missing") return

    setPending(true)
    try {
      const body = side === "buy" ? { side, symbol: ticker, amount: check.value } : { side, symbol: ticker, shares: check.value }
      const result = await mutate<{ queued: true; why: "closed" | "no-live-price"; ticker: string } | { queued?: undefined; ticker: string; shares: number; price: number }>(`/api/fantasy/${leagueId}/trade`, { body })
      if (result.queued) {
        toast(
          result.why === "closed"
            ? `${side === "buy" ? "Buy" : "Sell"} of ${result.ticker} queued. It fills at the live price after the market opens.`
            : `We couldn't get a live price for ${result.ticker} just now, so your ${side} is queued and fills as soon as we do.`,
          "success",
        )
        setAmount("")
        setTouched(false)
        onTraded()
        return
      }
      // The receipt is the confirmation (it speaks to screen readers too), so success needs no toast.
      setReceipt({ id: Date.now(), side, ticker: result.ticker, shares: result.shares, price: result.price, averageCost: held?.averageCost ?? null, isNew: !held })
      if (side === "buy") setBurst((b) => b + 1)
      try {
        navigator.vibrate?.(side === "buy" ? 18 : [12, 40, 12])
      } catch {
        // No haptics here; nothing to do.
      }
      setAmount("")
      setTouched(false)
      onTraded()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Trade failed.", "error")
    } finally {
      setPending(false)
    }
  }

  // Sells every holding through the same endpoint a single sell uses, one after
  // another, so one bad ticker can't sink the rest. The list refreshes once at the end.
  // Money emoji and brand-coloured confetti burst from the Sell All button (Magic UI's Confetti on canvas-confetti).
  function celebrateCashOut() {
    const rect = cashButtonRef.current?.getBoundingClientRect()
    const origin = rect ? { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight } : { x: 0.5, y: 0.7 }
    const money = ["💸", "💰", "🤑"].map((text) => confetti.shapeFromText({ text, scalar: 2 }))
    void confettiRef.current?.fire({ origin, shapes: money, scalar: 2, particleCount: 26, spread: 80, startVelocity: 42, gravity: 0.9, ticks: 240, disableForReducedMotion: true })
    void confettiRef.current?.fire({ origin, particleCount: 100, spread: 110, startVelocity: 48, colors: ["#1baf7a", "#0a7152", "#f5b942", "#ffffff"], disableForReducedMotion: true })
  }

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
      celebrateCashOut()
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
      toast(queuedCount > 0 ? `Cash-out queued for ${queuedCount} ${queuedCount === 1 ? "holding" : "holdings"}. Fills after the open. 🎉` : "Cashed out! Every position is sold and you're ready for the next big thing. 🎉", "success")
    } else {
      toast(`${failed.join(", ")} didn't sell: ${firstError} The rest went through, so try those again.`, "error")
    }
  }

  return (
    <Card className="relative overflow-visible">
      {burst > 0 ? <Burst key={burst} /> : null}
      <Confetti ref={confettiRef} manualstart className="pointer-events-none fixed inset-0 z-[70] size-full" />
      {receipt ? <TradeReceipt receipt={receipt} onDone={closeReceipt} /> : null}
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Make a move</CardTitle>
        <div className="relative flex rounded-full bg-secondary p-1 text-xs font-semibold shadow-[inset_0_1px_2px_hsl(var(--foreground)/0.1)]" role="tablist" aria-label="Order side">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={side === s}
              onClick={() => { setSide(s); setAmount(""); setTouched(false) }}
              className={cn("press relative rounded-full px-4 py-1 capitalize transition-colors duration-200", side === s ? "text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {side === s ? (
                <motion.span
                  layoutId="trade-side"
                  aria-hidden
                  className={cn("absolute inset-0 rounded-full shadow-md", s === "buy" ? "bg-primary" : "bg-foreground")}
                  transition={{ type: "spring", stiffness: 520, damping: 38 }}
                />
              ) : null}
              <span className={cn("relative", side === s && s === "buy" && "text-primary-foreground")}>{s}</span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div>
            <TickerCombobox
              value={symbol}
              onChange={setSymbol}
              local={side === "sell" ? positions.map((p) => ({ symbol: p.ticker, name: null, detail: `You hold ${fmtShares(p.shares)} sh` })) : undefined}
              className="h-11 w-full rounded-xl border bg-background px-3 font-mono text-sm uppercase tracking-wide placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
            />
            <p className="numeric mt-1.5 min-h-4 text-xs text-muted-foreground" aria-live="polite">
              {lookup.state === "loading"
                ? "Looking up…"
                : quote
                  ? `${quote.name ?? quote.symbol} · ${formatCurrency(quote.price)} ${quote.live ? "live price" : `at the ${asOfLabel(quote.asOf)} close`}`
                  : lookup.state === "missing"
                    ? <span className="text-loss-ink">{lookup.message}</span>
                    : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(side === "buy" ? HYPE : positions.map((p) => p.ticker)).slice(0, 6).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSymbol(t)}
                className={cn("rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors hover:bg-secondary", ticker === t && "border-primary text-primary")}
              >
                {t}
              </button>
            ))}
          </div>

          <div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {side === "buy" ? "$" : "sh"}
              </span>
              <input
                aria-label={side === "buy" ? "Amount in dollars" : "Shares to sell"}
                aria-invalid={problem ? true : undefined}
                inputMode="decimal"
                autoComplete="off"
                value={amount === "all" ? "All" : amount}
                onChange={(e) => setAmount(sanitizeAmount(e.target.value, side === "buy" ? 2 : 4))}
                placeholder="0"
                className="numeric h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-sm aria-[invalid=true]:border-[--loss]"
              />
            </div>
            <p className="numeric mt-1.5 min-h-4 text-xs text-muted-foreground" aria-live="polite">
              {problem ? (
                <span className="text-loss-ink">{problem}</span>
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
          {side === "buy" ? (
            <ShimmerButton
              type="submit"
              disabled={pending || cashingOut}
              borderRadius="14px"
              shimmerColor="#d9fff0"
              background="linear-gradient(180deg, hsl(var(--primary)), hsl(var(--primary) / 0.82))"
              className="h-12 w-full text-sm font-semibold text-primary-foreground shadow-[0_10px_24px_-10px_hsl(var(--primary)/0.8)] disabled:pointer-events-none disabled:opacity-60"
            >
              {pending ? "Placing order…" : queues ? "Queue buy 🕘" : "Buy 🚀"}
            </ShimmerButton>
          ) : (
            <InteractiveHoverButton type="submit" disabled={pending || cashingOut} className="h-12 w-full rounded-[14px] text-sm disabled:pointer-events-none disabled:opacity-60">
              {pending ? "Placing order…" : queues ? "Queue sell 🕘" : "Sell 💸"}
            </InteractiveHoverButton>
          )}
          {side === "sell" ? (
            <Button
              type="button"
              ref={cashButtonRef}
              variant="secondary"
              className="group w-full"
              loading={cashingOut}
              disabled={positions.length === 0 || pending}
              onClick={sellAll}
            >
              {cashingOut ? "Cashing out…" : positions.length === 0 ? "Nothing to cash out yet" : (
                <>
                  <span aria-hidden className="inline-block transition-transform duration-200 group-hover:-rotate-12 group-hover:scale-125 motion-reduce:transition-none">🤑</span>
                  Cash out everything
                </>
              )}
            </Button>
          ) : null}
          <p className="text-[11px] leading-4 text-muted-foreground">
            {queues
              ? "The market's closed, so this waits and fills at the live price after the 9:30am ET open. You can cancel it until then."
              : "Fills at the live price shown."}{" "}
            Play money only.
          </p>
        </form>
      </CardContent>
    </Card>
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
    <div className="pt-8">
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
      <div className="relative mx-1 mt-1 h-5">
        {spots.map((spot) => (
          <button
            key={spot}
            type="button"
            disabled={!usable}
            onClick={() => onChange(amountFromFraction(side, spot, max, true))}
            className={cn(
              "absolute top-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none",
              spot === 1 ? "right-0 translate-x-1" : "-translate-x-1/2",
              active === spot && "bg-primary/10 font-semibold text-primary hover:bg-primary/15 hover:text-primary",
            )}
            style={spot === 1 ? undefined : { left: `${spot * 100}%` }}
          >
            {SPOT_LABEL[side][spot]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A little celebration on every buy and cash-out. Hidden when motion is reduced. */
function Burst({ pieces = ["🚀", "💎", "📈", "🔥", "💰", "🚀", "📈", "💎"] }: { pieces?: string[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex justify-center motion-reduce:hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="burst absolute text-xl"
          style={{ "--dx": `${(i - pieces.length / 2) * 28}px`, "--dy": `${-90 - (i % 3) * 30}px`, animationDelay: `${i * 25}ms` } as React.CSSProperties}
        >
          {p}
        </span>
      ))}
    </div>
  )
}
