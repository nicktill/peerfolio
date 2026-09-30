"use client"

import { useRef, useState } from "react"
import { ChevronDown, FileUp, Loader2, X } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Dialog } from "@web/components/ui/dialog"
import { useToast } from "@web/components/ui/toast"
import { plural } from "@web/lib/plural"
import { mutate } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"

type Row = { symbol: string; quantity: number; avgCost: number | null; name: string | null; kind: "stock" | "crypto" }
type Preview = { rows: Row[]; warnings: string[]; reader: "table" | "ai" }
type Result = { imported: number; removed: number; failed: { symbol: string; reason: string }[]; pending: string[] }

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(n)
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)

/**
 * Bring many positions in at once: paste what you copied from your brokerage,
 * or upload its CSV export. You get a preview to check (and trim) before
 * anything is saved.
 */
export type ImportTarget = { id: string; name: string; hasPositions: boolean }

export function ImportPositionsButton({
  accounts,
  onDone,
  variant = "outline",
  label = "Import",
}: {
  /** The accounts positions can go into; with several, the dialog asks which. */
  accounts: ImportTarget[]
  onDone: () => void
  variant?: "outline" | "ghost" | "default"
  label?: string
}) {
  const [open, setOpen] = useState(false)
  if (accounts.length === 0) return null
  return (
    <>
      <Button variant={variant} size="sm" className="rounded-full" onClick={() => setOpen(true)}>
        <FileUp aria-hidden />
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Import positions"
        description="Paste your holdings from your brokerage, or upload its CSV export. You’ll check them before anything is saved."
        className="sm:max-w-2xl"
      >
        <ImportFlow
          accounts={accounts}
          onClose={() => setOpen(false)}
          onSaved={() => {
            onDone()
          }}
        />
      </Dialog>
    </>
  )
}

function ImportFlow({ accounts, onClose, onSaved }: { accounts: ImportTarget[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [accountId, setAccountId] = useState(accounts[0]!.id)
  const hasPositions = accounts.find((a) => a.id === accountId)?.hasPositions ?? false
  const file = useRef<HTMLInputElement>(null)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [replace, setReplace] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  async function read(source: string) {
    setError(null)
    setBusy(true)
    try {
      const data = await mutate<Preview>("/api/import/parse", { body: { text: source } })
      setPreview(data)
      setRows(data.rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that.")
    } finally {
      setBusy(false)
    }
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    event.target.value = ""
    if (!picked) return
    if (picked.size > 2_000_000) return setError("That file is too big. Export just your positions.")
    const content = await picked.text()
    setText(content)
    await read(content)
  }

  async function save() {
    setError(null)
    setBusy(true)
    try {
      const data = await mutate<Result>(`/api/accounts/${accountId}/positions/import`, { body: { rows, replace } })
      setResult(data)
      if (data.imported > 0) onSaved()
      if (data.failed.length === 0 && data.pending.length === 0) toast(`Imported ${plural(data.imported, "position")}.`, "success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import.")
    } finally {
      setBusy(false)
    }
  }

  // Step 3: what happened.
  if (result) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          <span className="font-semibold">{plural(result.imported, "position")} imported.</span>
          {result.removed > 0 ? ` ${plural(result.removed, "old position")} removed.` : ""}
        </p>
        {result.pending.length > 0 ? (
          <p className="rounded-xl border p-3 text-sm text-muted-foreground">
            {plural(result.pending.length, "holding")} {result.pending.length === 1 ? "is" : "are"} waiting for a price and will fill in within a few minutes:{" "}
            <span className="font-mono text-foreground">{result.pending.join(", ")}</span>
          </p>
        ) : null}
        {result.failed.length > 0 ? (
          <div className="space-y-2 rounded-xl border p-3 text-sm">
            <p className="font-medium">{plural(result.failed.length, "holding")} couldn’t be added</p>
            <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
              {result.failed.map((f) => (
                <li key={f.symbol}>
                  <span className="font-mono font-semibold text-foreground">{f.symbol}</span>: {f.reason}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Mutual funds and some other products can’t be priced yet. Everything else went in.</p>
          </div>
        ) : null}
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    )
  }

  // Step 2: check it.
  if (preview) {
    return (
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium">
            {plural(rows.length, "holding")} found
            <span className="ml-2 text-xs font-normal text-muted-foreground">{preview.reader === "ai" ? "read by AI, please check" : "read from your table"}</span>
          </p>
          <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => { setPreview(null); setError(null) }}>
            Back
          </button>
        </div>

        {preview.warnings.map((w) => (
          <p key={w} className="text-xs text-muted-foreground">{w}</p>
        ))}

        <div className="max-h-72 overflow-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Ticker</th>
                <th className="px-3 py-2 text-right font-medium">Shares</th>
                <th className="px-3 py-2 text-right font-medium">Avg cost</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.symbol}>
                  <td className="px-3 py-2">
                    <span className="font-mono font-semibold">{r.symbol}</span>
                    {r.name ? <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">{r.name}</span> : null}
                  </td>
                  <td className="numeric px-3 py-2 text-right">{fmt(r.quantity)}</td>
                  <td className="numeric px-3 py-2 text-right text-muted-foreground">{r.avgCost != null ? money(r.avgCost) : "—"}</td>
                  <td className="pr-2 text-right">
                    <button type="button" className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => setRows(rows.filter((x) => x.symbol !== r.symbol))}>
                      <X className="size-3.5" aria-hidden />
                      <span className="sr-only">Leave out {r.symbol}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hasPositions ? (
          <fieldset className="space-y-2 text-sm">
            <legend className="sr-only">What to do with what’s already here</legend>
            {[
              { value: false, label: "Add to what’s already in this account", hint: "Same tickers are updated; others stay." },
              { value: true, label: "Make this account match the list", hint: "Anything not in the list is removed." },
            ].map((o) => (
              <label key={String(o.value)} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", replace === o.value && "border-primary/60 bg-primary/5")}>
                <input type="radio" name="mode" className="mt-1" checked={replace === o.value} onChange={() => setReplace(o.value)} />
                <span>
                  <span className="block font-medium">{o.label}</span>
                  <span className="text-xs text-muted-foreground">{o.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {error ? <p role="alert" className="text-sm text-loss-ink">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy || rows.length === 0} loading={busy}>
            Import {plural(rows.length, "position")}
          </Button>
        </div>
      </div>
    )
  }

  // Step 1: bring it in.
  return (
    <div className="space-y-4">
      {accounts.length > 1 ? (
        <div>
          <label htmlFor="import-account" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Import into
          </label>
          <select
            id="import-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <BrokerHelp />

      <div>
        <label htmlFor="import-text" className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Paste your positions
        </label>
        <textarea
          id="import-text"
          data-autofocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"Copy the positions table from your brokerage and paste it here.\n\nOr type one per line:\nAAPL 10 @ 150\nVTI 25 @ 210.50"}
          className="w-full resize-y rounded-xl border bg-background p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {error ? <p role="alert" className="text-sm text-loss-ink">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <input ref={file} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e)} />
          <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()} disabled={busy}>
            <FileUp aria-hidden />
            Upload a CSV
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void read(text)} disabled={busy || text.trim().length < 3}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Read it
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Nothing is saved until you confirm. Only tickers, share counts and average cost are used. Text that isn’t a plain table may be read by an AI model.
      </p>
    </div>
  )
}

const BROKERS: { name: string; steps: string }[] = [
  { name: "Fidelity", steps: "Open Positions, click the download icon (a down arrow) above the table, then upload the file here." },
  { name: "Vanguard", steps: "My accounts → Holdings → Download (spreadsheet/CSV), then upload the file here." },
  { name: "Schwab", steps: "Open Positions and use Export at the top right of the table, then upload the file here." },
  { name: "E*TRADE", steps: "Portfolios → Positions → Download, then upload the file here." },
  { name: "Robinhood", steps: "Robinhood’s report is a trade history, not your holdings. Instead open your account page on the website, select the list of stocks, copy it and paste it below." },
  { name: "Something else", steps: "Open your positions page, select the table, copy it and paste it below. Or type one per line: AAPL 10 @ 150." },
]

/** Where to get the list, per broker. Kept short and honest: steps vary, and pasting always works. */
function BrokerHelp() {
  const [open, setOpen] = useState(false)
  const [broker, setBroker] = useState(BROKERS[0]!.name)
  const current = BROKERS.find((b) => b.name === broker)!
  return (
    <div className="rounded-xl border bg-secondary/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium"
      >
        Where do I get my list?
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="space-y-3 border-t px-3 py-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Your brokerage">
            {BROKERS.map((b) => (
              <button
                key={b.name}
                type="button"
                onClick={() => setBroker(b.name)}
                aria-pressed={broker === b.name}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  broker === b.name ? "border-primary/60 bg-primary/10 font-medium" : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {b.name}
              </button>
            ))}
          </div>
          <p className="text-sm">{current.steps}</p>
          <p className="text-xs text-muted-foreground">Menus change from time to time. If you can’t find it, copying the table from your positions page and pasting it works everywhere.</p>
        </div>
      ) : null}
    </div>
  )
}
