"use client"

import { useEffect, useId, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Dialog } from "@web/components/ui/dialog"
import { disconnectNameMatches } from "@web/lib/disconnect-confirm"
import { USER_PRODUCTION_LINK_LIMIT } from "@web/lib/plaid-access-core"

/**
 * Disconnect confirmation. When the connection consumed a production link slot, that slot is permanently used,
 * so the person must type the institution name. Otherwise (sandbox, legacy Items) a plain confirm is enough and
 * nothing is said about slots. While the request is in flight the dialog cannot be dismissed.
 */
export function DisconnectDialog({
  institutionName,
  usesSlot,
  busy,
  onCancel,
  onConfirm,
}: {
  /** null while closed. */
  institutionName: string | null
  usesSlot: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState("")
  const inputId = useId()
  const hintId = useId()
  useEffect(() => setTyped(""), [institutionName])
  const matches = institutionName !== null && (!usesSlot || disconnectNameMatches(typed, institutionName))
  const close = () => {
    if (!busy) onCancel()
  }

  return (
    <Dialog
      open={institutionName !== null}
      onClose={close}
      title={`Disconnect ${institutionName ?? ""}?`}
      description={usesSlot ? "Its accounts are removed from Peerfolio and their history stops updating." : "Its accounts are removed from Peerfolio and their history stops updating. You can connect it again later."}
      className="sm:max-w-md"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (matches && !busy) onConfirm()
        }}
      >
        {usesSlot ? (
          <>
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
                disabled={busy}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-describedby={hintId}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              />
              <p id={hintId} className="text-xs text-muted-foreground">The button unlocks when the name matches.</p>
            </div>
          </>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={!matches || busy} loading={busy} data-autofocus={usesSlot ? undefined : true}>
            {usesSlot ? "Disconnect permanently" : "Disconnect"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
