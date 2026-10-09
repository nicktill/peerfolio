"use client"

import { useState } from "react"
import { AlertTriangle, PauseCircle, PlayCircle } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Card, CardContent } from "@web/components/ui/card"
import { useToast } from "@web/components/ui/toast"
import { cacheClear } from "@web/lib/api-cache"
import { SHUTDOWN_PHRASE, shutdownConfirmed } from "@web/lib/plaid-switch-core"
import { mutate, useApi } from "@web/lib/use-api"

type Status = { paused: boolean; byEnv: boolean; changedAt: string | null; connections: number }

/**
 * Owner-only controls for stopping Plaid costs. Pausing is reversible and keeps every
 * connection; the shutdown removes them all at Plaid and cannot be undone.
 */
export function PlaidKillSwitch() {
  const { toast } = useToast()
  const { data, error, refetch } = useApi<Status>("/api/admin/plaid")
  const [busy, setBusy] = useState(false)
  const [arming, setArming] = useState(false)
  const [phrase, setPhrase] = useState("")

  if (error || !data) return error ? <p role="alert" className="text-sm text-loss-ink">{error}</p> : null

  async function setPaused(paused: boolean) {
    setBusy(true)
    try {
      await mutate("/api/admin/plaid", { method: "PATCH", body: { paused } })
      cacheClear("/api/plaid/access")
      toast(paused ? "Plaid is paused. Nothing will reach it until you resume." : "Plaid is back on.", paused ? "info" : "success")
      await refetch()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not change the switch.", "error")
    } finally {
      setBusy(false)
    }
  }

  async function shutdown() {
    setBusy(true)
    try {
      const result = await mutate<{ removed: number; failed: number; total: number }>("/api/admin/plaid/shutdown", { body: { confirm: phrase } })
      cacheClear("/api/plaid/access")
      toast(
        result.failed === 0
          ? `Disconnected ${result.removed} ${result.removed === 1 ? "connection" : "connections"}. Plaid is paused.`
          : `Disconnected ${result.removed} of ${result.total}. ${result.failed} could not be removed; they were kept so you can run this again.`,
        result.failed === 0 ? "success" : "error",
      )
      setArming(false)
      setPhrase("")
      await refetch()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Shutdown failed.", "error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className={data.paused ? "border-[--loss]/50" : undefined}>
      <CardContent className="space-y-5 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-medium">
              {data.paused ? <PauseCircle aria-hidden className="size-5 text-loss-ink" /> : <PlayCircle aria-hidden className="size-5 text-gain-ink" />}
              Plaid kill switch
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.paused ? "Plaid is paused." : "Plaid is on."} {data.connections} linked {data.connections === 1 ? "connection" : "connections"}.
            </p>
          </div>
          {data.byEnv ? (
            <p className="text-xs text-muted-foreground">Paused by the <code>PLAID_KILL_SWITCH</code> environment variable. Remove it in Vercel to resume.</p>
          ) : (
            <Button variant={data.paused ? "default" : "outline"} size="sm" loading={busy && !arming} disabled={busy} onClick={() => void setPaused(!data.paused)}>
              {data.paused ? "Resume Plaid" : "Pause Plaid"}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Pausing stops new links, syncs, webhooks and every paid Plaid call. Existing connections and their last numbers stay, and people can still disconnect.
          Plaid keeps billing each linked connection every month until it is removed, so pausing alone does not stop that charge.
        </p>

        <div className="rounded-xl border border-[--loss]/40 bg-[color-mix(in_srgb,var(--loss)_6%,transparent)] p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-loss-ink">
            <AlertTriangle aria-hidden className="size-4" />
            Emergency shutdown
          </h3>
          <p className="mt-1 text-sm">
            This <strong>disconnects every linked brokerage for every user</strong> and removes the connections at Plaid. It cannot be undone: people have to link their
            accounts again, and their linked numbers disappear until they do. Manual accounts are not touched.
          </p>
          {arming ? (
            <div className="mt-3 space-y-3">
              <label htmlFor="shutdown-phrase" className="block text-sm">
                Type <code className="rounded bg-secondary px-1.5 py-0.5 font-semibold">{SHUTDOWN_PHRASE}</code> to confirm.
              </label>
              <input
                id="shutdown-phrase"
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
                autoComplete="off"
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              />
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" loading={busy} disabled={busy || !shutdownConfirmed(phrase)} onClick={() => void shutdown()}>
                  Disconnect everyone
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setArming(false); setPhrase("") }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button className="mt-3" variant="destructive" size="sm" disabled={busy || data.connections === 0} onClick={() => setArming(true)}>
              {data.connections === 0 ? "Nothing to disconnect" : "Disconnect everyone…"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
