"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, ChevronDown, Landmark, RefreshCw, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { Button } from "@web/components/ui/button"
import { Delta } from "@web/components/ui/delta"
import { useConfirm } from "@web/components/ui/confirm"
import { useToast } from "@web/components/ui/toast"
import { ConnectButton } from "@web/components/dashboard/connect-button"
import { AddAccountButton } from "@web/components/dashboard/add-account-dialog"
import { ImportPositionsButton } from "@web/components/dashboard/import-positions-dialog"
import { PositionsEditor, type PositionRow } from "@web/components/dashboard/positions-editor"
import { formatCurrency, formatRelativeTime } from "@web/lib/format"
import { plural } from "@web/lib/plural"
import { mutate } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"
import { reconcileAccountExpansion } from "@web/lib/account-expansion"

export type AccountRow = {
  id: string
  name: string
  mask: string | null
  category: string
  balance: number
  isLiability: boolean
  source: "plaid" | "manual"
  institutionName: string
  institutionLogo: string | null
  itemId: string | null
  positions: PositionRow[]
}

export type ItemRow = {
  id: string
  institutionName: string
  institutionLogo: string | null
  status: "active" | "needs_reauth" | "error" | "disconnected"
  errorCode: string | null
  lastSyncedAt: string | null
}

const GROUP_LABELS: Record<string, string> = {
  investment: "Investments",
  cash: "Cash",
  credit: "Credit",
  loan: "Loans",
  other: "Other",
}

const GROUP_ORDER = ["investment", "cash", "other", "credit", "loan"]

export function AccountsCard({
  accounts,
  items,
  hidden,
  onChange,
}: {
  accounts: AccountRow[]
  items: ItemRow[]
  hidden: boolean
  onChange: () => void
}) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [busyId, setBusyId] = useState<string | null>(null)
  // A just-created account is scrolled into view and briefly outlined, so the
  // eye lands where the next step (adding holdings) is.
  const [highlightId, setHighlightId] = useState<string | null>(null)
  // Accounts with many positions start collapsed so a big portfolio stays a
  // short list; a person's own choice wins once they click.
  const [openById, setOpenById] = useState<Record<string, boolean>>(() => reconcileAccountExpansion({}, accounts))
  const isOpen = (a: AccountRow) => openById[a.id] ?? false
  const toggle = (a: AccountRow) => setOpenById((prev) => ({ ...prev, [a.id]: !prev[a.id] }))

  useEffect(() => {
    setOpenById((prev) => reconcileAccountExpansion(prev, accounts))
  }, [accounts])

  useEffect(() => {
    if (!highlightId) return
    const row = document.getElementById(`account-${highlightId}`)
    if (!row) return // the refreshed list hasn't arrived yet; this runs again when it does
    row.scrollIntoView({ behavior: "smooth", block: "center" })
    const timer = setTimeout(() => setHighlightId(null), 2600)
    return () => clearTimeout(timer)
  }, [highlightId, accounts])

  const grouped = GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key]!,
    rows: accounts.filter((a) => a.category === key),
  })).filter((g) => g.rows.length > 0)

  const needsAttention = items.filter((i) => i.status === "needs_reauth" || i.status === "error")

  async function disconnect(itemId: string, name: string) {
    const ok = await confirm({
      title: `Disconnect ${name}?`,
      description: "Its accounts are removed from Peerfolio and their history stops updating. You can connect it again later.",
      confirmLabel: "Disconnect",
      tone: "danger",
    })
    if (!ok) return

    setBusyId(itemId)
    try {
      await mutate(`/api/plaid/items/${itemId}`, { method: "DELETE" })
      toast(`${name} disconnected.`, "success")
      onChange()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't disconnect.", "error")
    } finally {
      setBusyId(null)
    }
  }

  async function removeManual(id: string, name: string) {
    const account = accounts.find((a) => a.id === id)
    const count = account?.positions.length ?? 0
    const ok = await confirm({
      title: `Remove ${name}?`,
      description: `${count > 0 ? `This deletes the account and its ${count === 1 ? "position" : `${count} positions`}. ` : "This deletes the account. "}Your history treats the drop as money taken out, not a loss, so your return isn't affected.`,
      confirmLabel: "Remove account",
      tone: "danger",
    })
    if (!ok) return

    setBusyId(id)
    try {
      await mutate(`/api/accounts/${id}`, { method: "DELETE" })
      toast(`${name} removed.`, "success")
      onChange()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't remove that account.", "error")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Accounts</CardTitle>
        <span className="numeric text-sm text-muted-foreground">{accounts.length}</span>
        <div className="ml-auto">
          <ImportPositionsButton
            accounts={accounts
              .filter((a) => a.source === "manual" && a.category === "investment")
              .map((a) => ({ id: a.id, name: a.name, hasPositions: a.positions.length > 0 }))}
            onDone={onChange}
            variant="ghost"
            label="Import positions"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {needsAttention.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-[--series-4]/40 bg-[--series-4]/10 p-3"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-[--series-4]" aria-hidden />
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{item.institutionName}</span>{" "}
              {item.status === "needs_reauth"
                ? "needs you to sign in again before it can update."
                : "hit an error on its last sync."}
            </p>
            <ConnectButton itemId={item.id} onConnected={onChange} size="sm" variant="outline">
              Reconnect
            </ConnectButton>
          </div>
        ))}

        {grouped.map((group) => (
          <div key={group.key}>
            <h4 className="mb-2 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{group.label}</span>
              <span className={cn("numeric normal-case tracking-normal", group.key === "credit" || group.key === "loan" ? "text-loss-ink" : "")}>
                {group.key === "credit" || group.key === "loan" ? "−" : ""}
                {formatCurrency(
                  group.rows.reduce((sum, a) => sum + a.balance, 0),
                  { hidden, compact: true },
                )}
              </span>
            </h4>
            <ul className="space-y-1.5">
              {group.rows.map((account) => (
                <li
                  key={account.id}
                  id={`account-${account.id}`}
                  className={cn(
                    "group space-y-3 rounded-lg border bg-background p-3 transition-[background-color,box-shadow] duration-500 hover:bg-secondary/50",
                    highlightId === account.id && "shadow-[0_0_0_2px_hsl(var(--primary))]",
                  )}
                >
                  {(() => {
                    const expandable = account.source === "manual" && account.category === "investment"
                    const open = expandable && isOpen(account)
                    const withBasis = account.positions.filter((p) => p.costBasis)
                    const cost = withBasis.reduce((sum, p) => sum + (p.costBasis ?? 0), 0)
                    const worth = withBasis.reduce((sum, p) => sum + p.value, 0)
                    const detail = expandable ? (account.positions.length > 0 ? plural(account.positions.length, "position") : "No positions yet") : null
                    return (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => expandable && toggle(account)}
                          aria-expanded={expandable ? open : undefined}
                          aria-controls={expandable ? `account-body-${account.id}` : undefined}
                          disabled={!expandable}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left disabled:cursor-default"
                        >
                          <InstitutionMark logo={account.institutionLogo} name={account.institutionName} />

                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium">{account.name}</span>
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {account.institutionName}
                              {account.mask ? ` ···· ${account.mask}` : ""}
                              {account.source === "manual" ? " · by hand" : ""}
                              {detail ? ` · ${detail}` : ""}
                            </span>
                          </span>

                          <span className="shrink-0 text-right">
                            <span
                              className={cn("numeric block text-sm font-semibold", account.isLiability && "text-loss-ink")}
                            >
                              {account.isLiability ? "−" : ""}
                              {formatCurrency(account.balance, { hidden, compact: true })}
                            </span>
                            {expandable && !open && cost > 0 && !hidden ? (
                              <Delta value={((worth - cost) / cost) * 100} size="sm" variant="plain" className="justify-end" />
                            ) : null}
                          </span>

                          {expandable ? (
                            <ChevronDown
                              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                              aria-hidden
                            />
                          ) : null}
                        </button>

                        {account.source === "manual" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                            onClick={() => void removeManual(account.id, account.name)}
                            disabled={busyId === account.id}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            <span className="sr-only">Remove {account.name}</span>
                          </Button>
                        ) : null}
                      </div>
                    )
                  })()}

                  {account.source === "manual" && account.category === "investment" ? (
                    <div id={`account-body-${account.id}`} hidden={!isOpen(account)}>
                      <PositionsEditor
                        accountId={account.id}
                        positions={account.positions}
                        hidden={hidden}
                        onChange={onChange}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {items.length > 0 ? (
          <div className="space-y-2 border-t pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connections</h4>
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 text-sm">
                <InstitutionMark logo={item.institutionLogo} name={item.institutionName} size="sm" />
                <span className="min-w-0 flex-1 truncate">{item.institutionName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  Synced {formatRelativeTime(item.lastSyncedAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => void disconnect(item.id, item.institutionName)}
                  disabled={busyId === item.id}
                >
                  {busyId === item.id ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  )}
                  <span className="sr-only">Disconnect {item.institutionName}</span>
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <AddAccountButton
            onCreated={(id) => {
              setHighlightId(id)
              setOpenById((prev) => ({ ...prev, [id]: true }))
              onChange()
            }}
          />
          <ConnectButton onConnected={onChange} variant="outline" />
        </div>
      </CardContent>
    </Card>
  )
}

function InstitutionMark({
  logo,
  name,
  size = "md",
}: {
  logo: string | null
  name: string
  size?: "sm" | "md"
}) {
  const box = size === "sm" ? "h-7 w-7" : "h-9 w-9"

  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-card", box)}>
      {logo ? (
        // Plaid returns institution logos as base64 data URIs, so there is no
        // remote host for next/image to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-full w-full object-contain p-1" />
      ) : (
        <Landmark className="h-4 w-4 text-muted-foreground" aria-hidden />
      )}
      <span className="sr-only">{name}</span>
    </span>
  )
}
