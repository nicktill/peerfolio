"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Segmented } from "@web/components/ui/segmented"
import { useToast } from "@web/components/ui/toast"
import { formatCurrency, formatDate } from "@web/lib/format"
import { mutate } from "@web/lib/use-api"

export type PositionRow = {
  id: string
  ticker: string | null
  quantity: number
  value: number
  priceAsOf: string | null
}

const KINDS = [
  { value: "stock", label: "Stock / ETF" },
  { value: "crypto", label: "Crypto" },
] as const

type Kind = (typeof KINDS)[number]["value"]

const formatQuantity = (q: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(q)

/**
 * Positions inside a manual account. Each one is priced at the latest close
 * and repriced nightly, so the account's value moves with the market.
 */
export function PositionsEditor({
  accountId,
  positions,
  hidden,
  onChange,
}: {
  accountId: string
  positions: PositionRow[]
  hidden: boolean
  onChange: () => void
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(positions.length === 0)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [form, setForm] = useState<{ kind: Kind; symbol: string; quantity: string }>({
    kind: "stock",
    symbol: "",
    quantity: "",
  })

  async function add(event: React.FormEvent) {
    event.preventDefault()
    const quantity = Number(form.quantity)

    if (!form.symbol.trim()) return toast("Enter a ticker.", "error")
    if (!Number.isFinite(quantity) || quantity <= 0) return toast("Enter how many you hold.", "error")

    setSaving(true)
    try {
      await mutate(`/api/accounts/${accountId}/positions`, {
        body: { symbol: form.symbol.trim(), kind: form.kind, quantity },
      })
      setForm({ ...form, symbol: "", quantity: "" })
      onChange()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't add that position.", "error")
    } finally {
      setSaving(false)
    }
  }

  async function remove(position: PositionRow) {
    setBusyId(position.id)
    try {
      await mutate(`/api/accounts/${accountId}/positions/${position.id}`, { method: "DELETE" })
      onChange()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't remove that position.", "error")
    } finally {
      setBusyId(null)
    }
  }

  const asOf = positions.find((p) => p.priceAsOf)?.priceAsOf

  return (
    <div className="space-y-2 border-t pt-3">
      {positions.length > 0 ? (
        <ul className="space-y-1">
          {positions.map((position) => (
            <li key={position.id} className="flex items-center gap-3 text-sm">
              <span className="numeric w-14 shrink-0 font-semibold">{position.ticker}</span>
              <span className="numeric min-w-0 flex-1 truncate text-muted-foreground">
                {formatQuantity(position.quantity)}
              </span>
              <span className="numeric shrink-0">{formatCurrency(position.value, { hidden })}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => void remove(position)}
                disabled={busyId === position.id}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">Remove {position.ticker}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <form onSubmit={add} className="space-y-2">
          <Segmented<Kind>
            options={KINDS}
            value={form.kind}
            onChange={(kind) => setForm({ ...form, kind })}
            size="sm"
            label="Asset type"
          />
          <div className="flex gap-2">
            <input
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              placeholder={form.kind === "crypto" ? "BTC" : "VTI"}
              aria-label="Ticker"
              autoCapitalize="characters"
              className="h-9 w-24 min-w-0 rounded-lg border bg-background px-3 text-sm uppercase placeholder:normal-case"
            />
            <input
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="Quantity"
              aria-label="Quantity"
              inputMode="decimal"
              className="numeric h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm sm:max-w-40"
            />
            <Button type="submit" size="sm" className="h-9" loading={saving}>
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Priced at each day&apos;s close. Adding or removing a position counts as a deposit or withdrawal, not a
            gain. Adding a ticker you already hold replaces its quantity.
          </p>
        </form>
      ) : (
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setOpen(true)}>
          <Plus aria-hidden />
          Add position
        </Button>
      )}

      {asOf && !open ? <p className="text-xs text-muted-foreground">Prices as of {formatDate(`${asOf}T12:00:00`)}</p> : null}
    </div>
  )
}
