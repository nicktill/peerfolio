"use client"

import { useEffect, useState } from "react"
import { Building2, Search } from "lucide-react"
import { PlaidKillSwitch } from "@web/components/admin/plaid-kill-switch"
import { Button } from "@web/components/ui/button"
import { Card, CardContent } from "@web/components/ui/card"
import { useToast } from "@web/components/ui/toast"
import { cacheClear } from "@web/lib/api-cache"
import { mutate, useApi } from "@web/lib/use-api"

type BrokerageUser = { id: string; email: string; name: string | null; allowed: boolean }
type AdminData = {
  users: BrokerageUser[]
  capacity: { limit: number; used: number; reserved: number; uncertain: number; available: number; previouslyUsed: number }
}

export default function BrokerageAdminPage() {
  const { toast } = useToast()
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState<string | null>(null)
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
      toast(`${user.email}: brokerage linking ${user.allowed ? "disabled" : "enabled"}.`, "success")
      await refetch()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not update brokerage access.", "error")
    } finally {
      setSaving(null)
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Building2 aria-hidden className="size-6" />Brokerage access</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enable real brokerage linking for selected users. New users start with access disabled.</p>
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
              <p className="text-xs text-muted-foreground">Prior usage recorded: {data.capacity.previouslyUsed}. Connections made outside Peerfolio are not counted automatically. Check the <a href="https://dashboard.plaid.com" target="_blank" rel="noreferrer" className="underline">Plaid Dashboard</a> for total usage and keep the prior usage setting current.</p>
              <p className="text-xs text-muted-foreground">Each new production connection attempt consumes capacity. Disconnecting does not restore it. Reconnect repairs reuse the existing connection.</p>
            </CardContent>
          </Card>

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
                  <span className="text-xs text-muted-foreground">{user.allowed ? "Enabled" : "Disabled"}</span>
                  <Button variant={user.allowed ? "outline" : "default"} size="sm" disabled={saving !== null} loading={saving === user.id} onClick={() => void setAllowed(user)} aria-label={`${user.allowed ? "Disable" : "Enable"} brokerage linking for ${user.email}`}>
                    {user.allowed ? "Disable" : "Enable"}
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
