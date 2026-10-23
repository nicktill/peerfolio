"use client"

import { useState } from "react"
import { Button } from "@web/components/ui/button"
import { Dialog } from "@web/components/ui/dialog"
import { useToast } from "@web/components/ui/toast"
import { MAX_REQUEST_NOTE } from "@web/lib/plaid-access-core"
import { mutate, useApi } from "@web/lib/use-api"

/** "Request more connections" link for people stopped by the per-user cap or a full pool; the note is optional. */
export function RequestMore({ limit, full }: { limit: number; full: boolean }) {
  const { toast } = useToast()
  const { data, refetch } = useApi<{ requested: boolean }>("/api/brokerages/link-requests")
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)

  if (data?.requested) return <p className="w-full text-xs text-muted-foreground">Requested. We will be in touch.</p>

  async function send() {
    setSending(true)
    try {
      await mutate("/api/brokerages/link-requests", { body: { note } })
      toast("Request sent. Thanks.", "success")
      setOpen(false)
      setNote("")
      await refetch()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Couldn't send your request. Try again.", "error")
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="pf-request-more w-fit text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
        Request more connections
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Request more connections"
        description={full ? "Linking is full right now. Tell us what you want to connect and we will reach out when there is room." : `Tell us if you need more than ${limit}. We read every request.`}
        className="sm:max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="request-more-note" className="sr-only">Which brokerages do you want to add? (optional)</label>
            <textarea
              id="request-more-note" rows={3} value={note} maxLength={MAX_REQUEST_NOTE} onChange={(event) => setNote(event.target.value)}
              placeholder="Which brokerages do you want to add? (optional)" data-autofocus
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" onClick={() => void send()} loading={sending}>Send request</Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
