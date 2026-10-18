"use client"

import { useEffect, useState } from "react"
import { Search, Trophy } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { useToast } from "@web/components/ui/toast"
import { cacheClear } from "@web/lib/api-cache"
import { mutate, useApi } from "@web/lib/use-api"

type SportsUser = { id: string; email: string; name: string | null; granted: boolean; admin: boolean }
type Data = { mode: "off" | "all" | "admin"; granted: number; users: SportsUser[] }

const MODE_COPY = {
  off: "Sports is turned off for everyone.",
  admin: "Sports is limited to admins and the people granted access below.",
  all: "Sports is open to everyone, so these grants have no effect right now.",
} as const

export default function SportsAdminPage() {
  const { toast } = useToast()
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState<string | null>(null)
  const { data, error, loading, refetch } = useApi<Data>(`/api/admin/sports?q=${encodeURIComponent(query)}`)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  async function toggle(user: SportsUser) {
    setSaving(user.id)
    try {
      await mutate("/api/admin/sports", { method: "PATCH", body: { userId: user.id, allowed: !user.granted } })
      cacheClear("/api/sports/access")
      toast(`${user.email}: sports access ${user.granted ? "removed" : "granted"}.`, "success")
      await refetch()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not update sports access.", "error")
    } finally {
      setSaving(null)
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Trophy aria-hidden className="size-6" />Sports access</h1>
        <p className="mt-2 text-sm text-muted-foreground">{data ? MODE_COPY[data.mode] : "Choose who can use Sports while it is in beta."} Admins always have access.</p>
      </div>

      {error ? <p role="alert" className="text-sm text-loss-ink">{error}</p> : null}
      {loading && !data ? <p role="status" className="text-sm text-muted-foreground">Loading sports access…</p> : null}

      {data && !error ? (
        <div className="space-y-3">
          <label htmlFor="sports-user-search" className="block text-sm font-medium">Find a user <span className="font-normal text-muted-foreground">({data.granted} granted)</span></label>
          <div className="relative">
            <Search aria-hidden className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <input id="sports-user-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email" className="h-10 w-full rounded-lg border bg-background pl-10 pr-3 text-sm" />
          </div>
          <p className="text-xs text-muted-foreground">Showing up to 50 users, people with access first. Changes apply on their next page load.</p>
          <ul className="divide-y rounded-lg border">
            {data.users.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name ?? user.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <span className="text-xs text-muted-foreground">{user.admin ? "Admin" : user.granted ? "Has access" : "No access"}</span>
                {user.admin ? null : (
                  <Button variant={user.granted ? "outline" : "default"} size="sm" disabled={saving !== null} loading={saving === user.id} onClick={() => void toggle(user)} aria-label={`${user.granted ? "Remove" : "Grant"} sports access for ${user.email}`}>
                    {user.granted ? "Remove" : "Grant"}
                  </Button>
                )}
              </li>
            ))}
            {data.users.length === 0 ? <li className="p-4 text-sm text-muted-foreground">No matching users.</li> : null}
          </ul>
        </div>
      ) : null}
    </main>
  )
}
