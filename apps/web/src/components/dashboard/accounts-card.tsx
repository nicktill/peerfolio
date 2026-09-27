"use client"

import { useState } from "react"
import { AlertTriangle, Landmark, PencilLine, RefreshCw, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { Badge } from "@web/components/ui/badge"
import { Button } from "@web/components/ui/button"
import { useToast } from "@web/components/ui/toast"
import { ConnectButton } from "@web/components/dashboard/connect-button"
import { ManualAccountForm } from "@web/components/dashboard/manual-account-form"
import { PositionsEditor, type PositionRow } from "@web/components/dashboard/positions-editor"
import { formatCurrency, formatRelativeTime } from "@web/lib/format"
import { mutate } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"

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
  const [busyId, setBusyId] = useState<string | null>(null)

  const grouped = GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key]!,
    rows: accounts.filter((a) => a.category === key),
  })).filter((g) => g.rows.length > 0)

  const needsAttention = items.filter((i) => i.status === "needs_reauth" || i.status === "error")

  async function disconnect(itemId: string, name: string) {
    if (!window.confirm(`Disconnect ${name}? This removes its accounts and history stops updating.`)) return

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
    if (!window.confirm(`Remove ${name}?`)) return

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
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h4>
            <ul className="space-y-1.5">
              {group.rows.map((account) => (
                <li
                  key={account.id}
                  className="group space-y-3 rounded-lg border bg-background p-3 transition-colors hover:bg-secondary/50"
                >
                  <div className="flex items-center gap-3">
                    <InstitutionMark logo={account.institutionLogo} name={account.institutionName} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium">{account.name}</p>
                        {account.source === "manual" ? (
                          <Badge variant="outline" className="shrink-0">
                            <PencilLine aria-hidden />
                            Manual
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {account.institutionName}
                        {account.mask ? ` ···· ${account.mask}` : ""}
                      </p>
                    </div>

                    <span
                      className={cn("numeric shrink-0 text-sm font-semibold", account.isLiability && "text-[--loss]")}
                    >
                      {account.isLiability ? "−" : ""}
                      {formatCurrency(account.balance, { hidden, compact: true })}
                    </span>

                    {account.source === "manual" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                        onClick={() => void removeManual(account.id, account.name)}
                        disabled={busyId === account.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        <span className="sr-only">Remove {account.name}</span>
                      </Button>
                    ) : null}
                  </div>

                  {account.source === "manual" && account.category === "investment" ? (
                    <PositionsEditor
                      accountId={account.id}
                      positions={account.positions}
                      hidden={hidden}
                      onChange={onChange}
                    />
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
          <ConnectButton onConnected={onChange} variant="outline" />
          <ManualAccountForm onCreated={onChange} />
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
