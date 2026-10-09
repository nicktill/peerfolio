"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react"
import { Button } from "@web/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { useConfirm } from "@web/components/ui/confirm"
import { useToast } from "@web/components/ui/toast"
import { TickerCombobox } from "@web/components/fantasy/ticker-combobox"
import { TradeReceipt, type Receipt } from "@web/components/fantasy/trade-receipt"
import { fillsAtOpen } from "@web/lib/fantasy-rules"
import { formatCurrency } from "@web/lib/format"
import { amountFromFraction, BUY_SPOTS, checkTradeInput, estimateShares, fractionFromAmount, sanitizeAmount, SELL_SPOTS, snapFraction, snapThreshold } from "@web/lib/trade-input"
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
  const [cashBurst, setCashBurst] = useState(0)
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
      setCashBurst((b) => b + 1)
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
      {cashBurst > 0 ? <Burst key={`cash-${cashBurst}`} pieces={["💸", "💰", "🤑", "💵", "🎉", "💸", "💰", "🎉"]} /> : null}
      {receipt ? <TradeReceipt receipt={receipt} onDone={closeReceipt} /> : null}
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Make a move</CardTitle>
        <div className="flex rounded-full border p-0.5 text-xs font-medium" role="tablist">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={side === s}
              onClick={() => { setSide(s); setAmount(""); setTouched(false) }}
              className={cn("rounded-full px-3 py-1 capitalize transition-colors", side === s ? "bg-foreground text-background" : "text-muted-foreground")}
            >
              {s}
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
          <Button type="submit" className="w-full" size="lg" loading={pending} disabled={cashingOut} variant={side === "sell" ? "outline" : "default"}>
            {side === "buy" ? (queues ? "Queue buy 🕘" : "Buy 🚀") : queues ? "Queue sell 🕘" : "Sell 💸"}
          </Button>
          {side === "sell" ? (
            <Button
              type="button"
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
 * Dollars of buying power when buying, shares held when selling. Hotspots are
 * the old quick-picks; the thumb snaps onto one when the pointer gets close.
 */
function AmountSlider({ side, max, amount, onChange }: { side: "buy" | "sell"; max: number; amount: string; onChange: (next: string) => void }) {
  const barRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const caught = useRef<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [focused, setFocused] = useState(false)
  const reduceMotion = useReducedMotion()
  const spots = side === "buy" ? BUY_SPOTS : SELL_SPOTS
  const usable = max > 0
  const typed = amount === "all" ? 1 : max > 0 ? (Number(amount) || 0) / max : 0
  const fraction = Math.min(1, Math.max(0, Number.isFinite(typed) ? typed : 0))
  // An over-budget amount sits at the end of the track, but it is not "Max" or "All".
  const active = typed <= 1.005 ? spots.find((spot) => Math.abs(fraction - spot) <= 0.005) : undefined

  // Where the thumb is drawn. A stiff spring follows the real value, so a snap
  // onto a hotspot, a click on a label, and typing all glide, while a drag still
  // tracks the pointer closely. Reduced motion jumps straight there.
  const target = useMotionValue(fraction)
  const position = useSpring(target, { stiffness: 620, damping: 42, mass: 0.7 })
  const fillWidth = useTransform(position, (v) => `${v * 100}%`)
  const thumbLeft = useTransform(position, (v) => `${v * 100}%`)
  // The bubble stays inside the track at either end instead of hanging off it.
  const bubbleLeft = useTransform(position, (v) => `clamp(1.75rem, ${v * 100}%, calc(100% - 1.75rem))`)

  // Typing or a hotspot click. A drag places the thumb itself.
  useEffect(() => {
    if (dragging.current) return
    target.set(fraction)
    if (reduceMotion) position.jump(fraction)
  }, [fraction, position, reduceMotion, target])

  const apply = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect()
      if (!rect || !(max > 0)) return
      const raw = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width
      const snapped = snapFraction(raw, spots, snapThreshold(rect.width), caught.current)
      caught.current = snapped.snapped ? snapped.fraction : null
      onChange(amountFromFraction(side, snapped.fraction, max, snapped.snapped))
      target.set(snapped.fraction)
      if (reduceMotion) position.jump(snapped.fraction)
    },
    [max, onChange, position, reduceMotion, side, spots, target],
  )

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!usable) return
    const current = fractionFromAmount(amount, max)
    let next: number | null = null
    if (event.key === "Home") next = 0
    else if (event.key === "End") next = 1
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = event.shiftKey ? (spots.find((spot) => spot > current + 1e-6) ?? 1) : Math.min(1, current + 0.01)
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = event.shiftKey ? ([...spots].reverse().find((spot) => spot < current - 1e-6) ?? 0) : Math.max(0, current - 0.01)
    }
    if (next === null) return
    event.preventDefault()
    const onSpot = spots.some((spot) => Math.abs(spot - next!) < 1e-9)
    onChange(amountFromFraction(side, next, max, onSpot))
  }

  const valueNow = amount === "all" ? max : Number(amount) || 0
  const valueText = !usable
    ? side === "buy" ? "No buying power" : "No shares"
    : side === "buy"
      ? formatCurrency(valueNow)
      : amount === "all"
        ? `All ${fmtShares(max)} shares`
        : `${fmtShares(valueNow)} shares`

  const bubbleText = !usable ? "" : side === "buy" ? formatCurrency(valueNow) : amount === "all" ? "All" : fmtShares(valueNow)

  return (
    <div className={cn("pt-0.5", !usable && "opacity-40")}>
      <div
        role="slider"
        tabIndex={usable ? 0 : -1}
        aria-label={side === "buy" ? "Buying power" : "Shares to sell"}
        aria-valuemin={0}
        aria-valuemax={usable ? max : 0}
        aria-valuenow={usable ? valueNow : 0}
        aria-valuetext={valueText}
        aria-disabled={!usable || undefined}
        aria-orientation="horizontal"
        onPointerDown={(event) => {
          if (!usable) return
          event.currentTarget.setPointerCapture(event.pointerId)
          dragging.current = true
          setIsDragging(true)
          apply(event.clientX)
        }}
        onPointerMove={(event) => {
          if (dragging.current) apply(event.clientX)
        }}
        onPointerUp={(event) => {
          if (!dragging.current) return
          apply(event.clientX)
          dragging.current = false
          setIsDragging(false)
          caught.current = null
        }}
        onPointerCancel={() => {
          dragging.current = false
          setIsDragging(false)
          caught.current = null
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        className="group relative cursor-pointer py-2 outline-none touch-none focus-visible:outline-none"
      >
        <div ref={barRef} className="relative mx-2 h-1.5">
          <div className="absolute inset-0 rounded-full bg-secondary" />
          <motion.div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: fillWidth }} />
          {spots.map((spot) => (
            <span
              key={spot}
              aria-hidden
              className={cn(
                "absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/50 bg-background",
                active === spot && "size-2 border-primary bg-primary",
              )}
              style={{ left: `${spot * 100}%` }}
            />
          ))}
          <motion.span
            aria-hidden
            className="absolute top-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow-sm group-focus-visible:ring-2 group-focus-visible:ring-primary"
            style={{ left: thumbLeft }}
            animate={{ scale: isDragging ? 1.3 : 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
          />
          {/* The live amount rides above the thumb while you hold it. */}
          <motion.span
            aria-hidden
            className="numeric pointer-events-none absolute bottom-full z-20 mb-3 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-semibold text-background shadow-md"
            style={{ left: bubbleLeft }}
            initial={false}
            animate={{ opacity: usable && (isDragging || focused) ? 1 : 0, y: usable && (isDragging || focused) ? 0 : 4 }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
          >
            {bubbleText}
          </motion.span>
        </div>
      </div>
      <div className="relative mx-2 h-4">
        {spots.map((spot) => (
          <button
            key={spot}
            type="button"
            disabled={!usable}
            onClick={() => onChange(amountFromFraction(side, spot, max, true))}
            className={cn(
              "absolute top-0 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none",
              spot === 1 ? "right-0" : "-translate-x-1/2",
              active === spot && "font-semibold text-primary",
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
