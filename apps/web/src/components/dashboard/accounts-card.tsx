"use client"

import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  BadgeDollarSign,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ChevronDown,
  CreditCard,
  DollarSign,
  Landmark,
  RefreshCw,
  ReceiptText,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import { SectionCard } from "@web/components/ui/section-card"
import { Button } from "@web/components/ui/button"
import { Delta } from "@web/components/ui/delta"
import { useConfirm } from "@web/components/ui/confirm"
import { useToast } from "@web/components/ui/toast"
import { connectionNotice } from "@web/lib/plaid-status"
import { ConnectButton } from "@web/components/dashboard/connect-button"
import { AddAccountButton, EditAccountButton } from "@web/components/dashboard/add-account-dialog"
import { ImportPositionsButton } from "@web/components/dashboard/import-positions-dialog"
import { PositionsEditor, type PositionRow } from "@web/components/dashboard/positions-editor"
import { formatCurrency, formatRelativeTime } from "@web/lib/format"
import { plural } from "@web/lib/plural"
import { mutate } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"
import { reconcileAccountExpansion } from "@web/lib/account-expansion"
import { brandFor, type Brand } from "@web/lib/brokerages"

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

const OVERLAP_DISMISSED_KEY = "peerfolio:manual-overlap-dismissed"

export function AccountsCard({
  accounts,
  items,
  hidden,
  onChange,
  variant = "card",
}: {
  accounts: AccountRow[]
  items: ItemRow[]
  hidden: boolean
  onChange: () => void
  /** "rail": no card around it, for the quiet side column of the portfolio page. */
  variant?: "card" | "rail"
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
  const toggle = (a: AccountRow) => {
    setOpenById((prev) => ({ ...prev, [a.id]: !prev[a.id] }))
  }

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

  const needsAttention = items.filter((i) => i.status !== "active")

  // Linking a brokerage never replaces a hand-entered account, so the same money
  // can be counted twice. Offer the choice instead of guessing which ones match.
  // Read after mount so the server render and first client render agree.
  const [overlapDismissed, setOverlapDismissed] = useState(true)
  useEffect(() => {
    try {
      setOverlapDismissed(localStorage.getItem(OVERLAP_DISMISSED_KEY) === "1")
    } catch {
      setOverlapDismissed(false)
    }
  }, [])
  const hasLinkedInvestment = accounts.some((a) => a.source === "plaid" && a.category === "investment")
  const manualInvestments = accounts.filter((a) => a.source === "manual" && a.category === "investment")
  const showOverlap = !overlapDismissed && hasLinkedInvestment && manualInvestments.length > 0

  function dismissOverlap() {
    setOverlapDismissed(true)
    try {
      localStorage.setItem(OVERLAP_DISMISSED_KEY, "1")
    } catch {
      // Private mode: the notice just comes back next visit.
    }
  }

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

  const importButton = (
          <ImportPositionsButton
            accounts={accounts
              .filter((a) => a.source === "manual" && a.category === "investment")
              .map((a) => ({ id: a.id, name: a.name, hasPositions: a.positions.length > 0 }))}
            onDone={onChange}
            variant="ghost"
            label="Import positions"
          />
  )

  const body = (
      <div className={cn("space-y-5", variant === "card" ? "p-4" : "pt-2")}>
        {needsAttention.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-[--series-4]/40 bg-[--series-4]/10 p-3"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-[--series-4]" aria-hidden />
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{item.institutionName}</span>{" "}
              {connectionNotice(item).removeRequired
                ? connectionNotice(item).message
                : item.status === "needs_reauth"
                  ? "needs you to sign in again before it can update."
                  : "hit an error on its last sync."}
            </p>
            {connectionNotice(item).removeRequired ? (
              <Button size="sm" variant="outline" disabled={busyId === item.id} onClick={() => void disconnect(item.id, item.institutionName)}>
                Remove connection
              </Button>
            ) : (
              <ConnectButton itemId={item.id} onConnected={onChange} size="sm" variant="outline">
                Reconnect
              </ConnectButton>
            )}
          </div>
        ))}

        {showOverlap ? (
          <div className="space-y-2 rounded-lg border border-border bg-secondary/50 p-3">
            <p className="text-sm">
              You&apos;ve linked a brokerage and still have {manualInvestments.length === 1 ? "an account" : "accounts"} you entered by hand. If{" "}
              {manualInvestments.length === 1 ? "it holds" : "they hold"} the same money, remove {manualInvestments.length === 1 ? "it" : "them"} so it isn&apos;t counted twice.
              Linked accounts can also qualify you for verified rankings; accounts entered by hand can&apos;t.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {manualInvestments.map((account) => (
                <Button
                  key={account.id}
                  size="sm"
                  variant="outline"
                  disabled={busyId === account.id}
                  onClick={() => void removeManual(account.id, account.name)}
                >
                  <Trash2 aria-hidden />
                  Remove {account.name}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={dismissOverlap}>
                Keep both
              </Button>
            </div>
          </div>
        ) : null}

        {grouped.map((group) => (
          <div key={group.key}>
            <h3 className={cn("mb-1.5 flex items-baseline justify-between text-[12.5px] font-medium tracking-[-0.005em] text-muted-foreground", variant === "card" ? "px-2" : "px-0")}>
              <span>{group.label}</span>
              <span className={cn("numeric normal-case tracking-normal", group.key === "credit" || group.key === "loan" ? "text-loss-ink" : "")}>
                {group.key === "credit" || group.key === "loan" ? "−" : ""}
                {formatCurrency(
                  group.rows.reduce((sum, a) => sum + a.balance, 0),
                  { hidden, compact: true },
                )}
              </span>
            </h3>
            <ul className="space-y-1">
              {group.rows.map((account) => (
                <li
                  key={account.id}
                  id={`account-${account.id}`}
                  className={cn(
                    "group rounded-xl p-2 transition-[background-color,box-shadow] duration-300",
                    variant === "rail" && "-mx-2",
                    account.source === "manual" && account.category === "investment" && isOpen(account) ? "bg-secondary/50 shadow-[inset_0_0_0_1px_hsl(var(--border))]" : "hover:bg-secondary/50",
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
                          <InstitutionMark
                            logo={account.institutionLogo}
                            name={account.institutionName}
                            fallback={accountMark(account)}
                          />

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
                            {expandable && !open && cost > 0 ? (
                              <Delta value={((worth - cost) / cost) * 100} size="sm" variant="plain" className="justify-end" />
                            ) : null}
                          </span>

                          {expandable ? (
                            <ChevronDown
                              className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", open && "rotate-180")}
                              aria-hidden
                            />
                          ) : null}
                        </button>

                        {account.source === "manual" ? (
                          <EditAccountButton
                            account={{ id: account.id, name: account.name, institution: account.institutionName === "Manual account" ? "" : account.institutionName }}
                            onSaved={onChange}
                            className="h-8 w-8 shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                          />
                        ) : null}
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
                    // Opens by animating the row track from 0fr to 1fr, so the drawer grows to its real height.
                    <div
                      id={`account-body-${account.id}`}
                      inert={!isOpen(account)}
                      className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{ gridTemplateRows: isOpen(account) ? "1fr" : "0fr", opacity: isOpen(account) ? 1 : 0 }}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <div className="pt-3">
                          <PositionsEditor
                            accountId={account.id}
                            positions={account.positions}
                            hidden={hidden}
                            onChange={onChange}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {items.length > 0 ? (
          <div className="space-y-2 border-t pt-4">
            <h3 className="px-2 text-[12.5px] font-medium tracking-[-0.005em] text-muted-foreground">Connections</h3>
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 text-sm">
                <InstitutionMark logo={item.institutionLogo} name={item.institutionName} size="sm" />
                <span className="min-w-0 flex-1 truncate">{item.institutionName}</span>
                <span className="shrink-0 text-xs text-muted-foreground" title="Last successful sync">
                  {item.lastSyncedAt ? `Synced ${formatRelativeTime(item.lastSyncedAt)}` : "Awaiting first sync"}
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

        <div className={cn("flex flex-wrap gap-2 border-t pt-4", variant === "card" && "-mx-4 px-4")}>
          <AddAccountButton
            onCreated={(id) => {
              setHighlightId(id)
              setOpenById((prev) => ({ ...prev, [id]: true }))
              onChange()
            }}
          />
          <ConnectButton onConnected={onChange} variant="outline" />
        </div>
      </div>
  )

  if (variant === "rail") {
    return (
      <section aria-labelledby="rail-accounts">
        <div className="flex items-center justify-between gap-2">
          <h2 id="rail-accounts" className="text-sm font-semibold">
            Your accounts <span className="numeric font-normal text-muted-foreground">{accounts.length}</span>
          </h2>
          {importButton}
        </div>
        {body}
      </section>
    )
  }

  return (
    <SectionCard label={`Accounts · ${accounts.length}`} labelId="card-accounts" action={importButton}>
      {body}
    </SectionCard>
  )
}

function InstitutionMark({
  logo,
  name,
  fallback: Fallback = Landmark,
  size = "md",
}: {
  logo: string | null
  name: string
  /** What the account is (brokerage, 401(k), cash): the icon alone, or a corner badge on a firm's mark. */
  fallback?: LucideIcon
  size?: "sm" | "md"
}) {
  const box = size === "sm" ? "h-7 w-7" : "h-9 w-9"
  // Manual accounts carry no artwork, so recognise the firm from its name.
  const brand = logo ? null : brandFor(name)
  const marked = Boolean(logo || brand)

  return (
    <span className={cn("relative shrink-0", box)}>
      <span className={cn("flex h-full w-full items-center justify-center overflow-hidden rounded-xl border border-border/80 shadow-sm", !brand && "bg-gradient-to-br from-secondary to-background")}>
        {logo ? (
          // Plaid returns institution logos as base64 data URIs, so there is no
          // remote host for next/image to optimise.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-full w-full object-contain p-1" />
        ) : brand ? (
          <BrandTile brand={brand} />
        ) : (
          <Fallback className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden />
        )}
      </span>
      {/* The firm's mark says where; a small badge keeps saying what (an IRA, a 401(k), cash). */}
      {marked && size === "md" ? (
        <span className="absolute -bottom-1 -right-1 grid size-[18px] place-items-center rounded-full border bg-card shadow-sm" aria-hidden>
          <Fallback className="size-2.5 text-primary" strokeWidth={2.2} />
        </span>
      ) : null}
      <span className="sr-only">{name}</span>
    </span>
  )
}

/** A firm's icon via the logo proxy when it has a listed parent, else a monogram in its colour. */
function BrandTile({ brand }: { brand: Brand }) {
  const [failed, setFailed] = useState(false)
  const image = useRef<HTMLImageElement>(null)
  // An image that failed before hydration never fires onError, so check once mounted (as TickerLogo does).
  useEffect(() => {
    const el = image.current
    if (el?.complete && el.naturalWidth === 0) setFailed(true)
  }, [])
  if (brand.ticker && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- proxied and cached at the edge
      <img
        ref={image}
        src={`/api/market/logo/${encodeURIComponent(brand.ticker)}`}
        alt=""
        className="h-full w-full bg-white object-contain p-1.5"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span className="grid h-full w-full place-items-center font-display text-sm font-bold" style={{ backgroundColor: brand.color, color: inkOn(brand.color) }} aria-hidden>
      {brand.monogram}
    </span>
  )
}

/** Black or white letters, whichever reads better on a brand colour (WCAG relative luminance). */
function inkOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  return luminance > 0.179 ? "#000" : "#fff"
}

/** Manual accounts have no institution artwork, so their icon describes what the account does. */
function accountMark(account: AccountRow): LucideIcon {
  if (account.category === "cash") return DollarSign
  if (account.category === "credit") return CreditCard
  if (account.category === "loan") return ReceiptText
  if (account.category !== "investment") return Landmark

  const label = `${account.name} ${account.institutionName}`.toLowerCase()
  if (/pension|annuity/.test(label)) return BadgeDollarSign
  if (/401|403|457|employer|workplace/.test(label)) return BriefcaseBusiness
  return ChartNoAxesCombined
}
