"use client"

import { useRef, useState } from "react"
import { FileUp, Loader2, X } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Dialog } from "@web/components/ui/dialog"
import { useToast } from "@web/components/ui/toast"
import { plural } from "@web/lib/plural"
import { mutate } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"

type Row = { symbol: string; quantity: number; avgCost: number | null; name: string | null; kind: "stock" | "crypto" }
type Preview = { rows: Row[]; warnings: string[]; reader: "table" | "ai" }
type Result = { imported: number; removed: number; failed: { symbol: string; reason: string }[]; notTried: string[] }

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(n)
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)

/**
 * Bring many positions in at once: paste what you copied from your brokerage,
 * or upload its CSV export. You get a preview to check (and trim) before
 * anything is saved.
 */
export function ImportPositionsButton({
  accountId,
  hasPositions,
  onDone,
  variant = "outline",
}: {
  accountId: string
  hasPositions: boolean
  onDone: () => void
  variant?: "outline" | "ghost"
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} size="sm" className="rounded-full" onClick={() => setOpen(true)}>
        <FileUp aria-hidden />
        Import
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Import positions"
        description="Paste your holdings from your brokerage, or upload its CSV export. You’ll check them before anything is saved."
        className="sm:max-w-2xl"
      >
        <ImportFlow
          accountId={accountId}
          hasPositions={hasPositions}
          onClose={() => setOpen(false)}
          onSaved={() => {
            onDone()
          }}
        />
      </Dialog>
    </>
  )
}

function ImportFlow({ accountId, hasPositions, onClose, onSaved }: { accountId: string; hasPositions: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
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
      if (data.failed.length === 0 && data.notTried.length === 0) toast(`Imported ${plural(data.imported, "position")}.`, "success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import.")
    } finally {
      setBusy(false)
    }
  }

  // Step 3: what happened.
  if (result) {
    const problems = result.failed.length + result.notTried.length
    return (
      <div className="space-y-4">
        <p className="text-sm">
          <span className="font-semibold">{plural(result.imported, "position")} imported.</span>
          {result.removed > 0 ? ` ${plural(result.removed, "old position")} removed.` : ""}
        </p>
        {problems > 0 ? (
          <div className="space-y-2 rounded-xl border p-3 text-sm">
            <p className="font-medium">{plural(problems, "holding")} didn’t go in</p>
            <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
              {result.failed.map((f) => (
                <li key={f.symbol}>
                  <span className="font-mono font-semibold text-foreground">{f.symbol}</span>: {f.reason}
                </li>
              ))}
              {result.notTried.length > 0 ? (
                <li>
                  Prices are rate-limited right now. Import these again in a minute:{" "}
                  <span className="font-mono text-foreground">{result.notTried.join(", ")}</span>
                </li>
              ) : null}
            </ul>
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
