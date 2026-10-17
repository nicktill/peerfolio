"use client"

import { useEffect, useState } from "react"
import { Building2, Search } from "lucide-react"
import { PlaidKillSwitch } from "@web/components/admin/plaid-kill-switch"
import { Button } from "@web/components/ui/button"
import { Card, CardContent } from "@web/components/ui/card"
import { useToast } from "@web/components/ui/toast"
import { cacheClear } from "@web/lib/api-cache"
import { mutate, useApi } from "@web/lib/use-api"

type BrokerageUser = { id: string; email: string; name: string | null; allowed: boolean; linkLimit: number | null; effectiveLimit: number; used: number }
type LinkRequest = { id: string; userId: string; email: string; name: string | null; note: string | null; createdAt: string; used: number; effectiveLimit: number }
type AdminData = {
  requests?: LinkRequest[]
  users: BrokerageUser[]
  orphanedPool2Items?: number
  credentials?: { pool: number; configured: boolean; state?: "enabled" | "disabled" | "not_set"; clientId?: string }[]
  capacity: { limit: number; used: number; reserved: number; uncertain: number; available: number; previouslyUsed: number; pool2Error?: string | null; pools: { pool: number; limit: number; used: number; reserved: number; uncertain: number; available: number; previouslyUsed: number }[] }
}

export default function BrokerageAdminPage() {
  const { toast } = useToast()
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const { data, error, loading, refetch } = useApi<AdminData>(`/api/admin/brokerages?q=${encodeURIComponent(query)}`)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  async function setAllowed(user: BrokerageUser) {
    setSaving(user.id)
    try {
      await mutate("/api/admin/brokerages", { method: "PATCH", body: { userId: user.id, allowed: !user.allowed } })
      cacheClear("/api/plaid/access")
      toast(`${user.email}: brokerage linking ${user.allowed ? "blocked" : "restored"}.`, "success")
      await refetch()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not update brokerage access.", "error")
    } finally {
      setSaving(null)
    }
  }

  async function setLimit(user: BrokerageUser, linkLimit: number | null) {
    setSaving(user.id)
    try {
      await mutate("/api/admin/brokerages", { method: "PATCH", body: { userId: user.id, linkLimit } })
      cacheClear("/api/plaid/access")
      setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== user.id)))
      toast(`${user.email}: ${linkLimit === null ? "limit reset to the default" : `limit set to ${linkLimit}`}.`, "success")
      await refetch()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not update the link limit.", "error")
    } finally {
      setSaving(null)
    }
  }

  async function resolveRequest(req: LinkRequest, raise: boolean) {
    setSaving(req.id)
    try {
      if (raise) await mutate("/api/admin/brokerages", { method: "PATCH", body: { userId: req.userId, linkLimit: Math.min(10, req.effectiveLimit + 1) } })
      await mutate("/api/admin/brokerages", { method: "DELETE", body: { requestId: req.id } })
      cacheClear("/api/plaid/access")
      toast(raise ? `${req.email}: limit raised to ${Math.min(10, req.effectiveLimit + 1)}.` : `${req.email}: request closed.`, "success")
      await refetch()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not update the request.", "error")
    } finally {
      setSaving(null)
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Building2 aria-hidden className="size-6" />Brokerage access</h1>
        <p className="mt-2 text-sm text-muted-foreground">Brokerage linking is open to every user, with a lifetime limit on connections each. Use this to block or restore an individual user.</p>
      </div>

      <PlaidKillSwitch />

      {error ? <p role="alert" className="text-sm text-loss-ink">{error}</p> : null}
      {loading && !data ? <p role="status" className="text-sm text-muted-foreground">Loading brokerage access…</p> : null}

      {data && !error ? (
        <>
          <Card>
            <CardContent className="space-y-3 pt-5">
              <h2 className="font-medium">Production connection budget</h2>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {([
                  ["Limit", data.capacity.limit],
                  ["Consumed", data.capacity.used],
                  ["Reserved / uncertain", data.capacity.reserved + data.capacity.uncertain],
                  ["Remaining", data.capacity.available],
                ] as const).map(([label, value]) => (
                  <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>
                ))}
              </dl>
              {data.capacity.pool2Error ? <p role="alert" className="text-sm text-loss-ink">Pool 2 misconfigured: {data.capacity.pool2Error}. Pool 2 is off until this is fixed.</p> : null}
              {data.orphanedPool2Items ? <p role="alert" className="text-sm text-loss-ink">{data.orphanedPool2Items} {data.orphanedPool2Items === 1 ? "Item is" : "Items are"} linked to pool 2 but its credentials are missing. They cannot sync or be removed until PLAID_TRIAL_*_2 is restored.</p> : null}
              {data.credentials ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {data.credentials.map((c) => (
                    <li key={c.pool}>Trial team {c.pool}: {c.state === "not_set" || !c.configured ? "not set" : c.state === "disabled" ? `configured but disabled (client ID ${c.clientId}); set PLAID_TRIAL_2_ENABLED=1 to use it` : `enabled (client ID ${c.clientId})`}</li>
                  ))}
                </ul>
              ) : null}
              {data.capacity.pools.length > 1 ? (
                <ul className="space-y-1 text-sm">
                  {data.capacity.pools.map((pool) => (
                    <li key={pool.pool} className="tabular-nums">Trial team {pool.pool}: {pool.used} of {pool.limit} used ({pool.available} left{pool.reserved + pool.uncertain > 0 ? `, ${pool.reserved + pool.uncertain} reserved or uncertain` : ""})</li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-muted-foreground">Prior usage recorded: {data.capacity.previouslyUsed}. Connections made outside Peerfolio are not counted automatically. Check the <a href="https://dashboard.plaid.com" target="_blank" rel="noreferrer" className="underline">Plaid Dashboard</a> for total usage and keep the prior usage setting current.</p>
              <p className="text-xs text-muted-foreground">Each new production connection attempt consumes capacity. Disconnecting does not restore it. Reconnect repairs reuse the existing connection.</p>
            </CardContent>
          </Card>

          {data.requests?.length ? (
            <Card>
              <CardContent className="space-y-1 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-medium">Requests for more</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{data.requests.length} open</span>
                </div>
                <ul className="divide-y">
                  {data.requests.map((req) => (
                    <li key={req.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{req.name ?? req.email}</p>
                        <p className="truncate text-xs text-muted-foreground"><span className="tabular-nums">{req.used} of {req.effectiveLimit} used</span> · {new Date(req.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                        <p className={`mt-1 text-sm ${req.note ? "" : "text-muted-foreground"}`}>{req.note ?? "No note"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {req.effectiveLimit < 10 ? (
                          <Button variant="outline" size="sm" disabled={saving !== null} loading={saving === req.id} onClick={() => void resolveRequest(req, true)} aria-label={`Raise link limit for ${req.email} to ${req.effectiveLimit + 1}`}>Raise to {req.effectiveLimit + 1}</Button>
                        ) : null}
                        <Button variant="ghost" size="sm" disabled={saving !== null} onClick={() => void resolveRequest(req, false)} aria-label={`Mark request from ${req.email} done`}>Mark done</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <div className="space-y-3">
            <label htmlFor="brokerage-user-search" className="block text-sm font-medium">Find a user</label>
            <div className="relative">
              <Search aria-hidden className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <input id="brokerage-user-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email" className="h-10 w-full rounded-lg border bg-background pl-10 pr-3 text-sm" />
            </div>
            <p className="text-xs text-muted-foreground">Disabling access blocks new connections. Existing connections can still refresh, reconnect, and disconnect.</p>
            <p className="text-xs text-muted-foreground">Showing up to 50 users. Search to find a specific account.</p>
            <ul className="divide-y rounded-lg border">
              {data.users.map((user) => (
                <li key={user.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.name ?? user.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">{user.used} of {user.effectiveLimit} used{user.linkLimit === null ? "" : " (custom)"}</span>
                    <label className="sr-only" htmlFor={`limit-${user.id}`}>Link limit for {user.email}</label>
                    <input
                      id={`limit-${user.id}`}
                      type="number" inputMode="numeric" min={0} max={10} step={1}
                      value={drafts[user.id] ?? String(user.effectiveLimit)}
                      onChange={(event) => setDrafts((prev) => ({ ...prev, [user.id]: event.target.value }))}
                      className="h-8 w-16 rounded-md border bg-background px-2 text-sm text-foreground"
                    />
                    <Button variant="outline" size="sm" disabled={saving !== null || drafts[user.id] === undefined || !/^\d+$/.test(drafts[user.id]!) || Number(drafts[user.id]) > 10} onClick={() => void setLimit(user, Number(drafts[user.id]))} aria-label={`Save link limit for ${user.email}`}>Save</Button>
                    {user.linkLimit !== null ? <Button variant="ghost" size="sm" disabled={saving !== null} onClick={() => void setLimit(user, null)} aria-label={`Reset link limit for ${user.email} to the default`}>Reset</Button> : null}
                  </div>
                  <span className="text-xs text-muted-foreground">{user.allowed ? "Allowed" : "Blocked"}</span>
                  <Button variant={user.allowed ? "outline" : "default"} size="sm" disabled={saving !== null} loading={saving === user.id} onClick={() => void setAllowed(user)} aria-label={`${user.allowed ? "Block" : "Restore"} brokerage linking for ${user.email}`}>
                    {user.allowed ? "Block" : "Restore"}
                  </Button>
                </li>
              ))}
              {data.users.length === 0 ? <li className="p-4 text-sm text-muted-foreground">No matching users.</li> : null}
            </ul>
          </div>
        </>
      ) : null}
    </main>
  )
}
