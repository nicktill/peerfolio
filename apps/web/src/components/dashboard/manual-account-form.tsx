"use client"

import { useState } from "react"
import { PencilLine } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { useToast } from "@web/components/ui/toast"
import { mutate } from "@web/lib/use-api"

const CATEGORIES = [
  { value: "investment", label: "Brokerage / retirement" },
  { value: "cash", label: "Cash & savings" },
  { value: "credit", label: "Credit card" },
  { value: "loan", label: "Loan" },
] as const

/**
 * Adds a self-reported account.
 *
 * This exists so someone can start accumulating snapshot history before their
 * brokerage is connectable — that history can't be backfilled later. Manual
 * accounts are excluded from the public board by design.
 */
export function ManualAccountForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: "", institutionLabel: "", category: "investment", balance: "" })

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const balance = Number(form.balance)

    if (!form.name.trim()) return toast("Give the account a name.", "error")
    if (!Number.isFinite(balance) || balance < 0) return toast("Enter a valid balance.", "error")

    setSaving(true)
    try {
      await mutate("/api/accounts", {
        body: {
          name: form.name.trim(),
          institutionLabel: form.institutionLabel.trim() || undefined,
          category: form.category,
          balance,
        },
      })
      toast("Account added.", "success")
      setForm({ name: "", institutionLabel: "", category: "investment", balance: "" })
      setOpen(false)
      onCreated()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't add that account.", "error")
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PencilLine aria-hidden />
        Add manually
      </Button>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Account name">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Roth IRA"
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            autoFocus
          />
        </Field>
        <Field label="Institution (optional)">
          <input
            value={form.institutionLabel}
            onChange={(e) => setForm({ ...form, institutionLabel: e.target.value })}
            placeholder="Fidelity"
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          />
        </Field>
        <Field label="Type">
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Current value">
          <input
            value={form.balance}
            onChange={(e) => setForm({ ...form, balance: e.target.value })}
            inputMode="decimal"
            placeholder="12500"
            className="numeric h-10 w-full rounded-lg border bg-background px-3 text-sm"
          />
        </Field>
      </div>

      <p className="text-xs text-muted-foreground">
        Manual accounts count in private leagues but not on the public board, which only ranks connected portfolios.
      </p>

      <div className="flex gap-2">
        <Button type="submit" loading={saving} size="sm">
          Add account
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
