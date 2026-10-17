"use client"

import { useEffect, useRef, useState } from "react"
import { useAssistantView } from "@web/components/assistant/view-context"
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
import { usePreviewDemo } from "@web/components/app-shell"
import { connectionNotice } from "@web/lib/plaid-status"
import { ConnectButton } from "@web/components/dashboard/connect-button"
import { DisconnectDialog } from "@web/components/dashboard/disconnect-dialog"
import { AddAccountButton, EditAccountButton } from "@web/components/dashboard/add-account-dialog"
import { ImportPositionsButton } from "@web/components/dashboard/import-positions-dialog"
import { PositionsEditor, type PositionRow } from "@web/components/dashboard/positions-editor"
import { formatCurrency, formatRelativeTime } from "@web/lib/format"
import { plural } from "@web/lib/plural"
import { isEmptyLinkedAccount } from "@web/lib/empty-account"
import { mutate } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"
import { ReplaceAccountButton } from "@web/components/dashboard/replace-account-dialog"
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
  holdingCount?: number
  holdingsPending?: boolean
  holdingPreview?: string[]
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
  demo = false,
  hidden,
  onChange,
  variant = "card",
}: {
  accounts: AccountRow[]
  items: ItemRow[]
  demo?: boolean
  hidden: boolean
  onChange: () => void
  /** "rail": no card around it, for the quiet side column of the portfolio page. */
  variant?: "card" | "rail"
}) {
  const previewDemo = usePreviewDemo()
  const isDemo = demo || previewDemo
  const { toast } = useToast()
  const confirm = useConfirm()
  const [busyId, setBusyId] = useState<string | null>(null)
  // Disconnect permanently uses the connection slot, so it asks for the institution name in a dialog.
  const [disconnecting, setDisconnecting] = useState<{ id: string; name: string } | null>(null)
  // A just-created account is scrolled into view and briefly outlined, so the
  // eye lands where the next step (adding holdings) is.
  const [highlightId, setHighlightId] = useState<string | null>(null)
  // All accounts start closed; refreshes retain the person's choice once they click.
  const [openById, setOpenById] = useState<Record<string, boolean>>(() => reconcileAccountExpansion({}, accounts))
  const isOpen = (a: AccountRow) => openById[a.id] ?? false
  // The assistant resolves "this account" to the one card that is expanded (nothing when none or several are).
  const expanded = accounts.filter((a) => openById[a.id])
  useAssistantView({ account: expanded.length === 1 ? expanded[0]!.name : undefined })
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
    row.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" })
    const timer = setTimeout(() => setHighlightId(null), 2600)
    return () => clearTimeout(timer)
  }, [highlightId, accounts])

  // Linked accounts a brokerage reports at $0 with nothing in them (Robinhood's empty "Crypto")
  // stay in the database so later syncs can fill them, but they only clutter the list.
  const [showEmpty, setShowEmpty] = useState(false)
  const emptyLinked = accounts.filter(isEmptyLinkedAccount)
  const listed = showEmpty ? accounts : accounts.filter((a) => !isEmptyLinkedAccount(a))

  const grouped = GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key]!,
    rows: listed.filter((a) => a.category === key),
  })).filter((g) => g.rows.length > 0)

  const needsAttention = items.filter((i) => i.status !== "active")

  // Linking never automatically replaces a manual entry, so the same money
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

  function disconnect(itemId: string, name: string) {
    if (isDemo) return
    setDisconnecting({ id: itemId, name })
  }

  async function confirmDisconnect() {
    if (!disconnecting || isDemo) return
    const { id: itemId, name } = disconnecting
    setBusyId(itemId)
    try {
      await mutate(`/api/plaid/items/${itemId}`, { method: "DELETE" })
      toast(`${name} disconnected.`, "success")
      setDisconnecting(null)
      onChange()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't disconnect.", "error")
    } finally {
      setBusyId(null)
    }
  }

  async function refreshItem(itemId: string) {
    setBusyId(itemId)
    try {
      const { result } = await mutate<{ result: { status: string } }>(`/api/plaid/items/${itemId}`)
      if (result.status === "active") toast("Updated.", "success")
      else toast("Still getting your data. Give it a few more minutes.", "info")
    } catch {
      toast("Still getting your data. Give it a few more minutes.", "info")
    } finally {
      setBusyId(null)
      onChange()
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
      <div className={cn("space-y-2", variant === "card" ? "p-4" : "pt-2")}>
        {needsAttention.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-[--series-4]/40 bg-[--series-4]/10 p-3"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-[--series-4]" aria-hidden />
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{item.institutionName}</span>{" "}
              {isDemo ? "is a sample connection with a simulated sign-in issue." : connectionNotice(item).removeRequired
                ? connectionNotice(item).message
                : item.errorCode === "PRODUCT_NOT_READY"
                  ? "is still pulling in your data. First syncs can take a few minutes, and this updates on its own."
                : item.status === "needs_reauth"
                  ? "needs you to sign in again before it can update."
                  : "hit an error on its last sync."}
            </p>
            {isDemo ? <span className="pf-chip">Demo only</span> : connectionNotice(item).removeRequired ? (
              <Button size="sm" variant="outline" disabled={busyId === item.id} onClick={() => disconnect(item.id, item.institutionName)}>
                Remove connection
              </Button>
            ) : item.status === "error" ? (
              <Button size="sm" variant="outline" disabled={busyId === item.id} onClick={() => void refreshItem(item.id)}>
                {item.errorCode === "PRODUCT_NOT_READY" ? "Check now" : "Retry sync"}
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
            <p className="text-sm">Already tracking this brokerage manually? Replace its manual entry after checking the linked balance. We save the manual holdings as an archived backup and exclude them from your portfolio.</p>
            <div className="flex flex-wrap items-center gap-2">
              <ReplaceAccountButton accounts={accounts} hidden={hidden} disabled={isDemo} onSaved={onChange} />
              <Button size="sm" variant="ghost" onClick={dismissOverlap}>
                Keep both
              </Button>
            </div>
          </div>
        ) : null}

        {hasLinkedInvestment && manualInvestments.length > 0 ? (
          <div className="pb-2"><ReplaceAccountButton accounts={accounts} hidden={hidden} disabled={isDemo} onSaved={onChange} /></div>
        ) : null}

        {grouped.map((group) => (
          <div key={group.key}>
            <h3 className={cn("pf-notick mb-0.5 mt-1 flex items-baseline justify-between font-mono text-[11px] font-medium uppercase tracking-[0.045em] text-muted-foreground", variant === "card" ? "px-2" : "px-0")}>
              <span>{group.label}</span>
              {/* A lone account already shows its balance a line below; repeating it in the header is noise. */}
              <span className={cn("numeric normal-case tracking-normal", group.key === "credit" || group.key === "loan" ? "text-loss-ink" : "", group.rows.length === 1 && group.key !== "investment" && "hidden")}>
                {group.key === "credit" || group.key === "loan" ? "−" : ""}
                {formatCurrency(
                  group.rows.reduce((sum, a) => sum + a.balance, 0),
                  { hidden, compact: true },
                )}
              </span>
            </h3>
            <ul className="space-y-0.5">
              {group.rows.map((account) => (
                <li
                  key={account.id}
                  id={`account-${account.id}`}
                  className={cn(
                    "group rounded-xl px-2 py-1.5 transition-[background-color,box-shadow] duration-300",
                    variant === "rail" && "-mx-2",
                    account.category === "investment" && isOpen(account) ? "bg-secondary/50 shadow-[inset_0_0_0_1px_hsl(var(--border))]" : "hover:bg-secondary/50",
                    highlightId === account.id && "shadow-[0_0_0_2px_hsl(var(--primary))]",
                  )}
                >
                  {(() => {
                    const expandable = account.category === "investment"
                    const open = expandable && isOpen(account)
                    const withBasis = account.positions.filter((p) => p.costBasis)
                    const cost = withBasis.reduce((sum, p) => sum + (p.costBasis ?? 0), 0)
                    const worth = withBasis.reduce((sum, p) => sum + p.value, 0)
                    const detail = expandable ? (account.positions.length > 0 ? plural(account.positions.length, "position") : "No positions yet") : null
                    return (
                      <div className="pf-account-row relative flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => expandable && toggle(account)}
                          aria-expanded={expandable ? open : undefined}
                          aria-controls={expandable ? `account-body-${account.id}` : undefined}
                          disabled={!expandable}
                          className="pf-account-toggle flex min-w-0 flex-1 items-center gap-3 rounded-md text-left disabled:cursor-default"
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
                              {detail ? ` · ${detail}` : ""}
                            </span>
                          </span>

                          <span className="shrink-0 text-right">
                            <span
                              className={cn("numeric block text-sm font-medium", account.isLiability && "text-loss-ink")}
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
                            account={{ id: account.id, name: account.name, institution: account.institutionName === "Manual account" ? "" : account.institutionName, cashBalance: account.category === "cash" ? account.balance : undefined }}
                            onSaved={onChange}
                            className="pf-account-edit h-8 w-8 shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                          />
                        ) : null}
                        {account.source === "manual" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="pf-account-remove h-8 w-8 shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
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

                  {account.category === "investment" ? (
                    // Closed drawers leave layout entirely: hidden holdings must not extend document scroll height.
                    <div
                      id={`account-body-${account.id}`}
                      inert={!isOpen(account)}
                      className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                      style={{ display: isOpen(account) ? "grid" : "none", gridTemplateRows: "1fr", opacity: 1 }}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <div className="pt-3">
                          <PositionsEditor
                            accountId={account.id}
                            positions={account.positions}
                            readOnly={account.source === "plaid"}
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

        {emptyLinked.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowEmpty((v) => !v)}
            aria-expanded={showEmpty}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {showEmpty ? "Hide empty accounts" : `${plural(emptyLinked.length, "empty account")} hidden`}
          </button>
        ) : null}

        {items.length > 0 ? (
          <div className="space-y-2 border-t pt-4">
            <h3 className={cn("pf-notick font-mono text-[11px] font-medium uppercase tracking-[0.045em] text-muted-foreground", variant === "card" ? "px-2" : "px-0")}>Connections</h3>
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 text-sm">
                <InstitutionMark logo={item.institutionLogo} name={item.institutionName} size="sm" />
                <span className="min-w-0 flex-1 truncate">{item.institutionName}</span>
                <span className="shrink-0 text-xs text-muted-foreground" title={isDemo ? "Simulated last sync for this sample connection" : "Last successful sync"}>
                  {item.lastSyncedAt ? `Synced ${formatRelativeTime(item.lastSyncedAt)}` : "Awaiting first sync"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => disconnect(item.id, item.institutionName)}
                  disabled={isDemo || busyId === item.id}
                  title={isDemo ? "Sample connection" : `Disconnect ${item.institutionName}`}
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

        <div className={cn("pf-account-actions flex flex-wrap gap-2 border-t pt-4", variant === "card" && "-mx-4 px-4")}>
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

  const disconnectDialog = (
    <DisconnectDialog
      institutionName={disconnecting?.name ?? null}
      busy={disconnecting !== null && busyId === disconnecting.id}
      onCancel={() => setDisconnecting(null)}
      onConfirm={() => void confirmDisconnect()}
    />
  )

  if (variant === "rail") {
    return (
      <section aria-labelledby="rail-accounts" className="portfolio-accounts pf-panel min-w-0 p-4 sm:p-5">
        <div className="pf-ph">
          <h2 id="rail-accounts" className="pf-lbl">
            Your accounts <span className="numeric font-normal text-muted-foreground">{listed.length}</span>
          </h2>
          {importButton}
        </div>
        {body}
        {disconnectDialog}
      </section>
    )
  }

  return (
    <SectionCard label={`Accounts · ${listed.length}`} labelId="card-accounts" action={importButton}>
      {body}
      {disconnectDialog}
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
  // Bundled Vanguard's favicon sits on a white square, so that one falls through to a brand tile.
  const remote = logo && !logo.endsWith("/vanguard.png") ? logo : null
  const brand = remote ? null : brandFor(name)
  const marked = Boolean(remote || brand)

  return (
    <span className={cn("relative shrink-0", box)}>
      <span className={cn("flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-border/80 shadow-sm", !brand && "bg-gradient-to-br from-secondary to-background")}>
        {remote ? (
          // Plaid returns institution logos as base64 data URIs, so there is no
          // remote host for next/image to optimise.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={remote} alt="" className="h-full w-full object-contain p-1" />
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
  if (brand.glyph) {
    return (
      <span className="grid h-full w-full place-items-center" style={{ backgroundColor: brand.color }} aria-hidden>
        <span
          className="block h-[62%] w-[62%]"
          style={{ backgroundColor: brand.ink ?? "#fff", maskImage: `url(${brand.glyph})`, WebkitMaskImage: `url(${brand.glyph})`, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }}
        />
      </span>
    )
  }
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
