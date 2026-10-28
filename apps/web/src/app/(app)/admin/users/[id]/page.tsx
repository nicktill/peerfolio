"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { Card } from "@web/components/ui/card"
import { useApi } from "@web/lib/use-api"
import type { AdminUserDetail } from "@web/lib/admin-users"

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, error, loading } = useApi<AdminUserDetail>(id ? `/api/admin/users/${id}` : null)
  const u = data?.user
  const utm = u ? [u.utmSource, u.utmMedium, u.utmCampaign].filter(Boolean).join(" / ") : ""

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden className="size-4" />All users</Link>
      {error ? <p role="alert" className="text-sm text-loss-ink">{error}</p> : null}
      {loading && !data ? <p role="status" className="text-sm text-muted-foreground">Loading user…</p> : null}
      {data && u ? (
        <>
          <div className="flex items-center gap-4">
            <Avatar src={u.image} name={u.name} handle={u.handle} size="xl" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold">{u.name ?? "Unnamed"}</h1>
              <p className="truncate text-sm text-muted-foreground">{u.email}{u.handle ? ` · @${u.handle}` : ""}</p>
              <p className="text-xs text-muted-foreground">Joined {when(u.createdAt)}</p>
            </div>
          </div>
          <Card className="p-4">
            <h2 className="font-medium">Came from</h2>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {([["Referrer", u.referrer], ["UTM", utm], ["Landing page", u.landingPath]] as const).map(([label, value]) => (
                <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd>{value || "–"}</dd></div>
              ))}
            </dl>
          </Card>
          <Card className="p-4">
            <h2 className="font-medium">Accounts ({data.accounts.length})</h2>
            {data.accounts.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {data.accounts.map((a, i) => (<li key={i}>{a.name} <span className="text-muted-foreground">· {a.source === "manual" ? "manual" : "linked"} · {a.category}{a.active ? "" : " · inactive"}</span></li>))}
              </ul>
            ) : <p className="mt-2 text-sm text-muted-foreground">None yet.</p>}
          </Card>
          <Card className="p-4">
            <h2 className="font-medium">Activity</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {data.timeline.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <time dateTime={e.at} className="w-40 shrink-0 text-xs tabular-nums text-muted-foreground">{when(e.at)}</time>
                  <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{e.kind}</span>
                  <span className="min-w-0 flex-1">{e.text}</span>
                </li>
              ))}
            </ol>
          </Card>
        </>
      ) : null}
    </main>
  )
}
