"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Users } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { Card } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"
import { useApi } from "@web/lib/use-api"
import type { AdminUserRow } from "@web/lib/admin-users"

const sourceLabel = (u: Pick<AdminUserRow, "referrer" | "utmSource" | "utmMedium" | "utmCampaign" | "landingPath">) => {
  const utm = [u.utmSource, u.utmMedium, u.utmCampaign].filter(Boolean).join(" / ")
  return [u.referrer, utm, u.landingPath && u.landingPath !== "/" ? u.landingPath : null].filter(Boolean).join(" · ") || "Direct / unknown"
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

function Counts({ u }: { u: AdminUserRow }) {
  const items: [string, string | number][] = [
    ["Accounts", `${u.manualAccounts} manual / ${u.linkedAccounts} linked`], ["Holdings", u.holdings], ["Follows", `${u.following} out / ${u.followers} in`],
    ["Leagues", u.leagues], ["Fantasy", u.fantasy], ["Sports", u.sports], ["AI", `${u.aiCalls} calls · $${u.aiCostUsd.toFixed(2)}`], ["Brokerage", `${u.linkRequests} req / ${u.linkAttempts} tries`],
  ]
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
      {items.map(([label, value]) => (<div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{value}</dd></div>))}
    </dl>
  )
}

export default function UsersAdminPage() {
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const { data, error, loading } = useApi<{ users: AdminUserRow[] }>(`/api/admin/users?q=${encodeURIComponent(query)}`)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Users aria-hidden className="size-6" />Users</h1>
        <p className="mt-2 text-sm text-muted-foreground">Newest first. Counts only; open a user for their full history.</p>
      </div>
      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or handle" aria-label="Search users" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      {error ? <p role="alert" className="text-sm text-loss-ink">{error}</p> : null}
      {loading && !data ? <p role="status" className="text-sm text-muted-foreground">Loading users…</p> : null}
      {data && !data.users.length ? <EmptyState icon={Users} title="No users found" /> : null}
      <ul className="space-y-3">
        {data?.users.map((u) => (
          <li key={u.id}>
            <Link href={`/admin/users/${u.id}`} className="block">
              <Card className="p-4 transition-colors hover:bg-secondary/40">
                <div className="flex items-center gap-3">
                  <Avatar src={u.image} name={u.name} handle={u.handle} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{u.name ?? "Unnamed"} <span className="font-normal text-muted-foreground">{u.handle ? `@${u.handle}` : ""}</span></p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <time dateTime={u.createdAt} className="shrink-0 text-xs text-muted-foreground">{when(u.createdAt)}</time>
                </div>
                <p className="mt-2 text-xs"><span className="text-muted-foreground">Came from:</span> {sourceLabel(u)}</p>
                <Counts u={u} />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
