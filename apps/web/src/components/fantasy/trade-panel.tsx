"use client"

import { useState } from "react"
import { Button } from "@web/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { useToast } from "@web/components/ui/toast"
import { formatCurrency } from "@web/lib/format"
import { mutate } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"

type Held = { ticker: string; shares: number; value: number }

const HYPE = ["NVDA", "TSLA", "AAPL", "PLTR", "GME", "SPY"]

/** Buy by dollars, sell by shares. Fills at the latest daily close. */
export function TradePanel({ leagueId, cash, positions, onTraded }: { leagueId: string; cash: number; positions: Held[]; onTraded: () => void }) {
  const { toast } = useToast()
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [symbol, setSymbol] = useState("")
  const [amount, setAmount] = useState("")
  const [pending, setPending] = useState(false)
  const [burst, setBurst] = useState(0)

  const held = positions.find((p) => p.ticker === symbol.trim().toUpperCase())

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const body =
        side === "buy"
          ? { side, symbol, amount: Number(amount) }
          : { side, symbol, shares: amount === "all" ? "all" : Number(amount) }
      const result = await mutate<{ ticker: string; shares: number; price: number }>(`/api/fantasy/${leagueId}/trade`, { body })
      const verb = side === "buy" ? "Bought" : "Sold"
      toast(`${verb} ${result.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${result.ticker} at ${formatCurrency(result.price)}`, "success")
      if (side === "buy") setBurst((b) => b + 1)
      setAmount("")
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
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Make a move</CardTitle>
        <div className="flex rounded-full border p-0.5 text-xs font-medium" role="tablist">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={side === s}
              onClick={() => { setSide(s); setAmount("") }}
              className={cn("rounded-full px-3 py-1 capitalize transition-colors", side === s ? "bg-foreground text-background" : "text-muted-foreground")}
            >
              {s}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <input
            aria-label="Ticker"
            required
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Ticker, e.g. NVDA"
            className="h-11 w-full rounded-xl border bg-background px-3 font-mono text-sm uppercase tracking-wide placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
          />
          <div className="flex flex-wrap gap-1.5">
            {(side === "buy" ? HYPE : positions.map((p) => p.ticker)).slice(0, 6).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSymbol(t)}
                className={cn("rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors hover:bg-secondary", symbol === t && "border-primary text-primary")}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {side === "buy" ? "$" : "sh"}
            </span>
            <input
              aria-label={side === "buy" ? "Amount in dollars" : "Shares to sell"}
              required
              inputMode="decimal"
              value={amount === "all" ? "All" : amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0"
              className="numeric h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-sm"
            />
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
          <p className="numeric text-xs text-muted-foreground">
            {side === "buy" ? `${formatCurrency(cash)} available` : held ? `You hold ${held.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })} sh (${formatCurrency(held.value)})` : "Pick something you own"}
          </p>
          <Button type="submit" className="w-full" size="lg" loading={pending} variant={side === "sell" ? "outline" : "default"}>
            {side === "buy" ? "Buy 🚀" : "Sell 💸"}
          </Button>
          <p className="text-[11px] leading-4 text-muted-foreground">Fills at the latest closing price. Play money only.</p>
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
