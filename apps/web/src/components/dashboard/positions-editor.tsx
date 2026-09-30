"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircle, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Delta } from "@web/components/ui/delta"
import { Segmented } from "@web/components/ui/segmented"
import { ImportPositionsButton } from "@web/components/dashboard/import-positions-dialog"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import { useToast } from "@web/components/ui/toast"
import { formatCurrency, formatDate } from "@web/lib/format"
import { mutate } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"

export type PositionRow = {
  id: string
  ticker: string | null
  name: string | null
  kind: Kind
  quantity: number
  price: number
  value: number
  costBasis: number | null
  priceAsOf: string | null
}

const KINDS = [
  { value: "stock", label: "Stock / ETF" },
  { value: "crypto", label: "Crypto" },
] as const

type Kind = (typeof KINDS)[number]["value"]

type Quote = { symbol: string; kind: Kind; name: string | null; price: number; asOf: string }
type Lookup =
  | { state: "idle" }
  | { state: "loading"; symbol: string }
  | { state: "found"; quote: Quote }
  | { state: "missing"; symbol: string; message: string; suggestions: { symbol: string; name: string }[] }

/** Positions shown before "Show all", so a big account stays scannable. */
const PREVIEW_COUNT = 8

const formatQuantity = (q: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(q)
const asOfLabel = (d: string) => formatDate(`${d}T12:00:00`, "short")

/**
 * Positions inside a manual account. Each is priced at the latest close and
 * repriced nightly; an optional average cost turns on total return.
 */
export function PositionsEditor({
  id,
  accountId,
  positions,
  hidden,
  onChange,
}: {
  id?: string
  accountId: string
  positions: PositionRow[]
  hidden: boolean
  onChange: () => void
}) {
  const { toast } = useToast()
  const [editing, setEditing] = useState<PositionRow | "new" | null>(positions.length === 0 ? "new" : null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  async function remove(position: PositionRow) {
    setBusyId(position.id)
    try {
      await mutate(`/api/accounts/${accountId}/positions/${position.id}`, { method: "DELETE" })
      toast(`Removed ${position.ticker}.`, "success")
      onChange()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't remove that position.", "error")
    } finally {
      setBusyId(null)
    }
  }

  const withBasis = positions.filter((p) => p.costBasis)
  const totalCost = withBasis.reduce((s, p) => s + p.costBasis!, 0)
  const totalValueWithBasis = withBasis.reduce((s, p) => s + p.value, 0)
  const asOf = positions.find((p) => p.priceAsOf)?.priceAsOf

  return (
    <div id={id} className="space-y-3 border-t pt-3">
      {positions.length > 0 ? (
        <ul className="-mx-2 space-y-0.5">
          {(showAll ? positions : positions.slice(0, PREVIEW_COUNT)).map((p) => {
            const gain = p.costBasis ? p.value - p.costBasis : null
            return (
              <li key={p.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-secondary/60">
                <TickerLogo symbol={p.ticker ?? "?"} kind={p.kind} />
                <button type="button" onClick={() => setEditing(p)} className="min-w-0 flex-1 text-left">
                  <p className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-semibold">{p.ticker}</span>
                    <span className="truncate text-xs text-muted-foreground">{p.name}</span>
                  </p>
                  <p className="numeric truncate text-xs text-muted-foreground">
                    {formatQuantity(p.quantity)} {p.kind === "crypto" ? "" : "sh"} · {p.price > 0 ? formatCurrency(p.price) : "getting a price…"}
                    {p.costBasis ? ` · avg ${formatCurrency(p.costBasis / p.quantity)}` : ""}
                  </p>
                </button>
                <div className="shrink-0 text-right">
                  <p className="numeric text-sm font-semibold">{p.price > 0 ? formatCurrency(p.value, { hidden }) : "—"}</p>
                  {gain !== null ? (
                    <Delta value={(gain / p.costBasis!) * 100} size="sm" variant="plain" className="justify-end" />
                  ) : (
                    <button type="button" onClick={() => setEditing(p)} className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                      + add avg cost
                    </button>
                  )}
                </div>
                <div className="flex shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(p)}>
                    <Pencil className="size-3.5" aria-hidden />
                    <span className="sr-only">Edit {p.ticker}</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => void remove(p)} disabled={busyId === p.id}>
                    <Trash2 className="size-3.5" aria-hidden />
                    <span className="sr-only">Remove {p.ticker}</span>
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {positions.length > PREVIEW_COUNT ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full rounded-lg py-1.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          {showAll ? "Show fewer" : `Show all ${positions.length} positions`}
        </button>
      ) : null}

      {withBasis.length > 0 && !hidden ? (
        <div className="numeric flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          <span>Cost {formatCurrency(totalCost)}</span>
          <span className="inline-flex items-center gap-1">
            Total return
            <span className={totalValueWithBasis >= totalCost ? "text-gain-ink" : "text-loss-ink"}>
              {totalValueWithBasis >= totalCost ? "+" : "−"}
              {formatCurrency(Math.abs(totalValueWithBasis - totalCost))}
            </span>
            <Delta value={((totalValueWithBasis - totalCost) / totalCost) * 100} size="sm" />
          </span>
          {withBasis.length < positions.length ? <span>({withBasis.length} of {positions.length} with avg cost)</span> : null}
        </div>
      ) : null}

      {editing && positions.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Got a lot to add?</p>
            <p className="text-xs text-muted-foreground">Paste your positions or upload your brokerage’s CSV and add them all at once.</p>
          </div>
          <ImportPositionsButton accounts={[{ id: accountId, name: "This account", hasPositions: false }]} onDone={onChange} variant="default" label="Import positions" />
        </div>
      ) : null}

      {editing ? (
        <PositionForm
          key={editing === "new" ? "new" : editing.id}
          accountId={accountId}
          existing={editing === "new" ? null : editing}
          onCancel={positions.length > 0 ? () => setEditing(null) : undefined}
          onSaved={(message) => {
            toast(message, "success")
            setEditing(null)
            onChange()
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            Add position
          </Button>
          <ImportPositionsButton accounts={[{ id: accountId, name: "This account", hasPositions: positions.length > 0 }]} onDone={onChange} />
        </div>
      )}

      {asOf && !editing ? <p className="text-xs text-muted-foreground">Prices as of the {asOfLabel(asOf)} close. Updated nightly.</p> : null}
    </div>
  )
}

function PositionForm({
  accountId,
  existing,
  onCancel,
  onSaved,
}: {
  accountId: string
  existing: PositionRow | null
  onCancel?: () => void
  onSaved: (message: string) => void
}) {
  const [kind, setKind] = useState<Kind>(existing?.kind ?? "stock")
  const [symbol, setSymbol] = useState(existing?.ticker ?? "")
  const [shares, setShares] = useState(existing ? String(existing.quantity) : "")
  const [avg, setAvg] = useState(existing?.costBasis ? (existing.costBasis / existing.quantity).toFixed(2) : "")
  const [lookup, setLookup] = useState<Lookup>(
    existing?.ticker
      ? { state: "found", quote: { symbol: existing.ticker, kind: existing.kind, name: existing.name, price: existing.price, asOf: existing.priceAsOf ?? "" } }
      : { state: "idle" },
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const cache = useRef(new Map<string, Lookup>())
  const shareRef = useRef<HTMLInputElement>(null)

  async function resolve(raw: string, k: Kind = kind) {
    const request = ++requestId.current
    const s = raw.trim().toUpperCase()
    if (!s) return setLookup({ state: "idle" })
    const key = `${k}:${s}`
    const hit = cache.current.get(key)
    if (hit) return setLookup(hit)

    setLookup({ state: "loading", symbol: s })
    try {
      const response = await fetch(`/api/market/quote?symbol=${encodeURIComponent(s)}&kind=${k}`)
      const body = await response.json().catch(() => ({}))
      const next: Lookup = response.ok
        ? { state: "found", quote: body as Quote }
        : { state: "missing", symbol: s, message: body.error ?? `We couldn't find ${s}.`, suggestions: body.suggestions ?? [] }
      // Only cache definite answers; a rate limit or outage should be retried.
      if (response.ok || response.status === 404) cache.current.set(key, next)
      if (request === requestId.current) setLookup(next)
    } catch {
      if (request === requestId.current) setLookup({ state: "missing", symbol: s, message: "Price lookup failed. Check your connection and try the ticker again.", suggestions: [] })
    }
  }

  // Look up after a pause in typing, so a finished ticker previews without a click.
  useEffect(() => {
    if (existing) return
    const s = symbol.trim()
    if (!s) return
    const timer = setTimeout(() => void resolve(s), 700)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, kind])

  const quote = lookup.state === "found" ? lookup.quote : null
  const qty = Number(shares)
  const avgNum = avg.trim() ? Number(avg) : null
  const validQty = Number.isFinite(qty) && qty > 0
  const value = quote && validQty ? qty * quote.price : null
  const cost = validQty && avgNum && avgNum > 0 ? qty * avgNum : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!quote) return setError(lookup.state === "missing" ? lookup.message : "Pick a ticker first.")
    if (!validQty) return setError("Enter a positive number of shares or coins, not a dollar amount.")
    if (avgNum !== null && (!Number.isFinite(avgNum) || !(avgNum > 0))) return setError("Average cost must be a positive number.")

    setSaving(true)
    try {
      await mutate(`/api/accounts/${accountId}/positions`, {
        body: { symbol: quote.symbol, kind: quote.kind, quantity: qty, avgCost: avgNum },
      })
      onSaved(existing ? `Updated ${quote.symbol}.` : `Added ${formatQuantity(qty)} ${quote.symbol}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that position.")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="animate-rise-in space-y-4 rounded-2xl border bg-background p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{existing ? `Edit ${existing.ticker}` : "Add a position"}</p>
        {onCancel ? (
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onCancel}>
            <X className="size-4" aria-hidden />
            <span className="sr-only">Cancel</span>
          </Button>
        ) : null}
      </div>

      {!existing ? (
        <Segmented<Kind>
          options={KINDS}
          value={kind}
          onChange={(k) => {
            requestId.current++
            setKind(k)
            setLookup({ state: "idle" })
          }}
          size="sm"
          label="Asset type"
        />
      ) : null}

      {/* Ticker, with a live preview of what it resolves to */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`ticker-${accountId}`}>
          Ticker
        </label>
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border bg-card p-2 pr-3 transition-colors",
            lookup.state === "missing" && "border-[var(--loss)]/60",
            lookup.state === "found" && "border-primary/40",
          )}
        >
          {quote ? <TickerLogo symbol={quote.symbol} kind={quote.kind} /> : <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">{lookup.state === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "?"}</span>}
          <div className="min-w-0 flex-1">
            <input
              id={`ticker-${accountId}`}
              value={symbol}
              disabled={!!existing}
              onChange={(e) => {
                requestId.current++
                setSymbol(e.target.value.toUpperCase())
                setError(null)
                if (lookup.state !== "idle") setLookup({ state: "idle" })
              }}
              onBlur={() => void resolve(symbol)}
              placeholder={kind === "crypto" ? "BTC" : "AAPL"}
              autoCapitalize="characters"
              autoComplete="off"
              className="w-full bg-transparent font-mono text-base font-semibold uppercase outline-none placeholder:font-sans placeholder:font-normal placeholder:normal-case placeholder:text-muted-foreground disabled:opacity-100"
              aria-invalid={lookup.state === "missing"}
              aria-describedby={`ticker-status-${accountId}`}
            />
            <p id={`ticker-status-${accountId}`} className="truncate text-xs text-muted-foreground" aria-live="polite">
              {lookup.state === "found"
                ? `${lookup.quote.name ?? lookup.quote.symbol} · ${formatCurrency(lookup.quote.price)}${lookup.quote.asOf ? ` at the ${asOfLabel(lookup.quote.asOf)} close` : ""}`
                : lookup.state === "loading"
                  ? "Looking it up…"
                  : lookup.state === "missing"
                    ? null
                    : kind === "crypto"
                      ? "Coin symbol, e.g. BTC or ETH"
                      : "Stock or ETF symbol, e.g. AAPL or VTI"}
            </p>
          </div>
        </div>
        {lookup.state === "missing" ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-loss-ink">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            <span>{lookup.message}</span>
            {lookup.suggestions.map((s) => (
              <button
                key={s.symbol}
                type="button"
                onClick={() => {
                  setSymbol(s.symbol)
                  void resolve(s.symbol).then(() => shareRef.current?.focus())
                }}
                className="rounded-full border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
                title={s.name}
              >
                {s.symbol}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        Enter the {kind === "crypto" ? "coins" : "shares"} you already own, including fractions (for example, 2.5).
        This records your holdings; it does not buy anything. Dollar value is calculated from the latest closing price.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={kind === "crypto" ? "Number of coins" : "Number of shares"} htmlFor={`shares-${accountId}`}>
          <input
            ref={shareRef}
            id={`shares-${accountId}`}
            value={shares}
            onChange={(e) => { setShares(e.target.value); setError(null) }}
            placeholder="0"
            inputMode="decimal"
            className="numeric h-11 w-full rounded-xl border bg-card px-3 text-sm"
          />
        </Field>
        <Field label={kind === "crypto" ? "Average price paid per coin (USD)" : "Average price paid per share (USD)"} hint="Optional" htmlFor={`avg-${accountId}`}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <input
              id={`avg-${accountId}`}
              value={avg}
              onChange={(e) => { setAvg(e.target.value); setError(null) }}
              placeholder="Leave blank if unknown"
              inputMode="decimal"
              className="numeric h-11 w-full rounded-xl border bg-card pl-7 pr-3 text-sm"
            />
          </div>
        </Field>
      </div>

      {value !== null ? (
        <div className="numeric flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-xl bg-secondary/60 px-3 py-2.5 text-sm">
          <span>
            <span className="text-muted-foreground">Value at latest close </span>
            <span className="font-semibold">{formatCurrency(value)}</span>
          </span>
          {cost ? (
            <>
              <span>
                <span className="text-muted-foreground">Paid </span>
                {formatCurrency(cost)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className={value >= cost ? "text-gain-ink" : "text-loss-ink"}>
                  {value >= cost ? "+" : "−"}
                  {formatCurrency(Math.abs(value - cost))}
                </span>
                <Delta value={((value - cost) / cost) * 100} size="sm" />
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Add the average price you paid to see your holding’s gain or loss.</span>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-loss-ink">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">
          Adding shares counts as a deposit, not a gain, so your league return stays fair.
        </p>
        <Button type="submit" loading={saving} disabled={!quote}>
          {existing ? "Save holding" : quote ? `Add ${quote.symbol} holding` : "Add holding"}
        </Button>
      </div>
    </form>
  )
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline justify-between text-xs font-medium text-muted-foreground">
        {label}
        {hint ? <span className="font-normal">{hint}</span> : null}
      </label>
      {children}
    </div>
  )
}
