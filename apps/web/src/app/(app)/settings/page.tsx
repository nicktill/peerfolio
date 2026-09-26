"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { signOut } from "next-auth/react"
import { ExternalLink, Globe, Lock, ShieldCheck, Trash2 } from "lucide-react"
import { Badge } from "@web/components/ui/badge"
import { Button } from "@web/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { Skeleton } from "@web/components/ui/skeleton"
import { useToast } from "@web/components/ui/toast"
import { mutate, useApi } from "@web/lib/use-api"

type MeResponse = {
  user: { id: string; email: string; name: string | null; handle: string | null; bio: string | null; isPublic: boolean }
  stats: { snapshotDays: number; followers: number }
}

export default function SettingsPage() {
  const { toast } = useToast()
  const { data, loading, refetch } = useApi<MeResponse>("/api/me")

  const [handle, setHandle] = useState("")
  const [bio, setBio] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (data?.user) {
      setHandle(data.user.handle ?? "")
      setBio(data.user.bio ?? "")
    }
  }, [data])

  async function save(patch: Record<string, unknown>, message: string) {
    setSaving(true)
    try {
      await mutate("/api/me", { method: "PATCH", body: patch })
      toast(message, "success")
      await refetch()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't save.", "error")
    } finally {
      setSaving(false)
    }
  }

  async function deleteAccount() {
    const confirmed = window.confirm(
      "Delete your account? This disconnects every linked institution and permanently deletes your history, leagues you're alone in, and profile. It can't be undone.",
    )
    if (!confirmed) return

    setDeleting(true)
    try {
      await mutate("/api/me", { method: "DELETE" })
      await signOut({ callbackUrl: "/" })
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't delete your account.", "error")
      setDeleting(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.user.email}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="handle" className="text-xs font-medium text-muted-foreground">
              Handle
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">@</span>
              <input
                id="handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                maxLength={20}
                className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Letters, numbers and underscores. This is what people see on the board — never your email.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="bio" className="text-xs font-medium text-muted-foreground">
              Bio
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={160}
              rows={2}
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm"
              placeholder="Index funds and patience."
            />
            <p className="numeric text-xs text-muted-foreground">{bio.length}/160</p>
          </div>

          <Button
            onClick={() => void save({ handle, bio: bio.trim() || null }, "Profile saved.")}
            loading={saving}
            size="sm"
          >
            Save profile
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Public board</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border p-4">
            {data.user.isPublic ? (
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[--gain]" aria-hidden />
            ) : (
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {data.user.isPublic ? "Your profile is public" : "Your profile is private"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Public profiles show your handle, your percentage return and your top tickers as portfolio weights.
                Balances and dollar amounts are never shared, in any view.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={data.user.isPublic ? "outline" : "default"}
              size="sm"
              loading={saving}
              onClick={() =>
                void save(
                  { isPublic: !data.user.isPublic, ...(handle ? { handle } : {}) },
                  data.user.isPublic ? "Your profile is private again." : "You're on the board.",
                )
              }
            >
              {data.user.isPublic ? "Make private" : "Go public"}
            </Button>

            {data.user.isPublic && data.user.handle ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/u/${data.user.handle}`}>
                  View profile
                  <ExternalLink aria-hidden />
                </Link>
              </Button>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 gap-4 border-t pt-4">
            <div>
              <dt className="text-xs text-muted-foreground">Days of history</dt>
              <dd className="numeric mt-0.5 text-lg font-semibold">{data.stats.snapshotDays}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Followers</dt>
              <dd className="numeric mt-0.5 text-lg font-semibold">{data.stats.followers}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What we share</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2.5 text-sm">
            <Rule ok>Percentage returns, time-weighted so deposits don&apos;t count as performance</Rule>
            <Rule ok>Top tickers as a share of your own portfolio, if you opt in</Rule>
            <Rule>Account balances, net worth or position sizes — never shown to anyone</Rule>
            <Rule>Your email address — never shown to anyone</Rule>
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            The details are in our{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              privacy policy
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Disconnects every linked institution through Plaid and deletes your profile, accounts, holdings and
            history. Leagues you created pass to the longest-standing member.
          </p>
          <Button variant="destructive" size="sm" loading={deleting} onClick={() => void deleteAccount()}>
            {!deleting ? <Trash2 aria-hidden /> : null}
            Delete account
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Rule({ children, ok = false }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      {ok ? (
        <Badge variant="verified" className="mt-0.5 shrink-0">
          <ShieldCheck aria-hidden />
          Shared
        </Badge>
      ) : (
        <Badge variant="outline" className="mt-0.5 shrink-0">
          <Lock aria-hidden />
          Private
        </Badge>
      )}
      <span className="text-muted-foreground">{children}</span>
    </li>
  )
}
