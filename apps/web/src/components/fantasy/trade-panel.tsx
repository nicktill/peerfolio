"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@web/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { useToast } from "@web/components/ui/toast"
import { TickerCombobox } from "@web/components/fantasy/ticker-combobox"
import { TradeReceipt, type Receipt } from "@web/components/fantasy/trade-receipt"
import { fillsAtOpen } from "@web/lib/fantasy-rules"
import { formatCurrency } from "@web/lib/format"
import { checkTradeInput, estimateShares, sanitizeAmount } from "@web/lib/trade-input"
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
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [symbol, setSymbol] = useState("")
  const [amount, setAmount] = useState("")
  const [pending, setPending] = useState(false)
  const [burst, setBurst] = useState(0)
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

  return (
    <Card className="relative overflow-visible">
      {burst > 0 ? <Burst key={burst} /> : null}
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
          <div className="grid grid-cols-4 gap-1.5">
            {side === "buy"
              ? [0.1, 0.25, 0.5, 1].map((f) => (
                  <Quick key={f} onClick={() => setAmount((Math.floor(cash * f * 100) / 100).toString())}>
                    {f === 1 ? "Max" : `${f * 100}%`}
                  </Quick>
                ))
              : [0.25, 0.5, 0.75].map((f) => (
                  <Quick key={f} disabled={!held} onClick={() => held && setAmount((held.shares * f).toFixed(4))}>
                    {f * 100}%
                  </Quick>
                )).concat(
                  <Quick key="all" disabled={!held} onClick={() => setAmount("all")}>
                    All
                  </Quick>,
                )}
          </div>
          <Button type="submit" className="w-full" size="lg" loading={pending} variant={side === "sell" ? "outline" : "default"}>
            {side === "buy" ? (queues ? "Queue buy 🕘" : "Buy 🚀") : queues ? "Queue sell 🕘" : "Sell 💸"}
          </Button>
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

function Quick({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="rounded-lg border py-1.5 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-40">
      {children}
    </button>
  )
}

/** A little celebration on every buy. Hidden when motion is reduced. */
function Burst() {
  const pieces = ["🚀", "💎", "📈", "🔥", "💰", "🚀", "📈", "💎"]
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
