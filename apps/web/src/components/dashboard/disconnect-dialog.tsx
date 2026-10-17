"use client"

import { useEffect, useId, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Dialog } from "@web/components/ui/dialog"
import { disconnectNameMatches } from "@web/lib/disconnect-confirm"
import { USER_PRODUCTION_LINK_LIMIT } from "@web/lib/plaid-access-core"

/**
 * Deliberate disconnect: the connection slot is permanently used, so the person types the institution name first.
 * The confirm button stays disabled until the name matches.
 */
export function DisconnectDialog({
  institutionName,
  busy,
  onCancel,
  onConfirm,
}: {
  /** null while closed. */
  institutionName: string | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState("")
  const inputId = useId()
  const hintId = useId()
  useEffect(() => setTyped(""), [institutionName])
  const matches = institutionName !== null && disconnectNameMatches(typed, institutionName)

  return (
    <Dialog
      open={institutionName !== null}
      onClose={onCancel}
      title={`Disconnect ${institutionName ?? ""}?`}
      description="Its accounts are removed from Peerfolio and their history stops updating."
      className="sm:max-w-md"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (matches && !busy) onConfirm()
        }}
      >
        <p role="alert" className="flex gap-2 rounded-lg border border-[--series-4]/40 bg-[--series-4]/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[--series-4]" aria-hidden />
          <span>
            This connection slot is permanently used and cannot be refunded. Each account gets {USER_PRODUCTION_LINK_LIMIT} brokerage connections in total, so
            disconnecting does not free one up.
          </span>
        </p>
        <div className="space-y-1.5">
          <label htmlFor={inputId} className="block text-sm font-medium">
            Type <span className="font-semibold">{institutionName}</span> to confirm
          </label>
          <input
            id={inputId}
            data-autofocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-describedby={hintId}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          />
          <p id={hintId} className="text-xs text-muted-foreground">The button unlocks when the name matches.</p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={!matches || busy} loading={busy}>
            Disconnect permanently
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
