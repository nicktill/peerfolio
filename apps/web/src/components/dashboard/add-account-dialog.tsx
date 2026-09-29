"use client"

import { useState } from "react"
import { CreditCard, Landmark, Plus, TrendingUp, Wallet, type LucideIcon } from "lucide-react"
import { Button, type ButtonProps } from "@web/components/ui/button"
import { Dialog } from "@web/components/ui/dialog"
import { useToast } from "@web/components/ui/toast"
import { mutate } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"

type Category = "investment" | "cash" | "credit" | "loan"
type Tracking = "positions" | "balance"

const TYPES: { value: Category; label: string; hint: string; icon: LucideIcon; name: string; institution: string }[] = [
  { value: "investment", label: "Brokerage or retirement", hint: "Stocks, ETFs, crypto", icon: TrendingUp, name: "Roth IRA", institution: "Fidelity" },
  { value: "cash", label: "Cash & savings", hint: "Checking, savings", icon: Wallet, name: "Emergency fund", institution: "Chase" },
  { value: "credit", label: "Credit card", hint: "Counts as money owed", icon: CreditCard, name: "Sapphire Preferred", institution: "Chase" },
  { value: "loan", label: "Loan", hint: "Mortgage, student, auto", icon: Landmark, name: "Car loan", institution: "Toyota Financial" },
]

const TRACKING: { value: Tracking; label: string; hint: string }[] = [
  { value: "positions", label: "Stocks & crypto", hint: "Add what you hold. It's priced at each close, so your return updates on its own." },
  { value: "balance", label: "Total balance", hint: "Just enter what it's worth today. Good if you'd rather not list holdings." },
]

/**
 * Adds a self-reported account.
 *
 * This exists so someone can start accumulating snapshot history before their
 * brokerage is connectable — that history can't be backfilled later. Manual
 * accounts are excluded from the public board by design.
 *
 * After an investment account is created its holdings editor opens on its own
 * (see PositionsEditor), so the flow continues where the account appears.
 */
export function AddAccountButton({
  onCreated,
  children = "Add account",
  ...buttonProps
}: {
  /** Called with the new account's id once it exists. */
  onCreated: (accountId: string) => void
  children?: React.ReactNode
} & Pick<ButtonProps, "variant" | "size" | "className">) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button {...buttonProps} onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {children}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add an account"
        description="Track it by hand while brokerage linking is on the way. Your history starts today."
      >
        <AddAccountForm
          onCancel={() => setOpen(false)}
          onCreated={(id) => {
            setOpen(false)
            onCreated(id)
          }}
        />
      </Dialog>
    </>
  )
}

function AddAccountForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (accountId: string) => void }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [category, setCategory] = useState<Category>("investment")
  const [tracking, setTracking] = useState<Tracking>("positions")
  const [name, setName] = useState("")
  const [institution, setInstitution] = useState("")
  const [balance, setBalance] = useState("")
  const [errors, setErrors] = useState<{ name?: string; balance?: string }>({})

  const type = TYPES.find((t) => t.value === category)!
  // Positions only exist in investment accounts; everything else is a balance.
  const byPositions = category === "investment" && tracking === "positions"

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const amount = byPositions ? 0 : Number(balance.replace(/[$,\s]/g, ""))
    const next: typeof errors = {}
    if (!name.trim()) next.name = "Give the account a name."
    if (!byPositions && (!balance.trim() || !Number.isFinite(amount) || amount < 0)) {
      next.balance = category === "credit" || category === "loan" ? "Enter the amount you owe." : "Enter a balance, like 12500."
    }
    setErrors(next)
    if (next.name || next.balance) return

    setSaving(true)
    try {
      const { account } = await mutate<{ account: { id: string } }>("/api/accounts", {
        body: { name: name.trim(), institutionLabel: institution.trim() || undefined, category, balance: amount },
      })
      toast(byPositions ? "Account created. Add what you hold." : "Account added.", "success")
      onCreated(account.id)
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't add that account.", "error")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted-foreground">What kind of account?</legend>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <Choice key={t.value} name="category" checked={category === t.value} onChange={() => setCategory(t.value)}>
              <t.icon className="mb-2 size-5 text-primary" aria-hidden />
              <span className="block text-sm font-medium leading-tight">{t.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t.hint}</span>
            </Choice>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Account name" error={errors.name}>
          <input
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type.name}
            maxLength={60}
            aria-invalid={!!errors.name}
            className={inputClass}
          />
        </Field>
        <Field label="Institution (optional)">
          <input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder={type.institution}
            maxLength={60}
            className={inputClass}
          />
        </Field>
      </div>

      {category === "investment" ? (
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted-foreground">How do you want to track it?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TRACKING.map((t) => (
              <Choice key={t.value} name="tracking" checked={tracking === t.value} onChange={() => setTracking(t.value)}>
                <span className="flex items-center gap-2 text-sm font-medium leading-tight">
                  {t.label}
                  {t.value === "positions" ? (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">Best</span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{t.hint}</span>
              </Choice>
            ))}
          </div>
        </fieldset>
      ) : null}

      {!byPositions ? (
        <Field label={category === "credit" || category === "loan" ? "Amount you owe" : "Current balance"} error={errors.balance}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <input
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              inputMode="decimal"
              placeholder="12,500"
              aria-invalid={!!errors.balance}
              className={cn(inputClass, "numeric pl-7")}
            />
          </div>
        </Field>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {byPositions ? "Next you'll add the stocks you hold. " : ""}Accounts added by hand count in your private leagues but not on the
        public Board, which only ranks connected brokerages.
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} className="h-11 sm:h-10">
          Cancel
        </Button>
        <Button type="submit" loading={saving} className="h-11 sm:h-10">
          {byPositions ? "Create & add holdings" : "Add account"}
        </Button>
      </div>
    </form>
  )
}

const inputClass =
  "h-11 w-full rounded-xl border bg-background px-3 text-sm transition-colors placeholder:text-muted-foreground/70 aria-[invalid=true]:border-[--loss] sm:h-10"

/** A selectable card. A real radio underneath, so arrow keys and screen readers work. */
function Choice({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="relative block cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        className={cn(
          "block h-full rounded-xl border bg-background p-3 transition-[border-color,box-shadow,background-color]",
          "hover:bg-secondary/60 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card",
          "peer-checked:border-primary peer-checked:bg-accent/50 peer-checked:shadow-[inset_0_0_0_1px_hsl(var(--primary))]",
        )}
      >
        {children}
      </span>
    </label>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="block text-xs text-loss-ink">
          {error}
        </span>
      ) : null}
    </label>
  )
}
