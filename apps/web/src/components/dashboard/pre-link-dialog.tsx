"use client"

import { Button } from "@web/components/ui/button"
import { Dialog } from "@web/components/ui/dialog"
import type { PreLinkNotice } from "@web/lib/plaid-link-copy"

/** Short, calm heads-up before Plaid Link opens. Escape, the backdrop and Cancel all back out. */
export function PreLinkDialog({ notice, onCancel, onContinue }: { notice: PreLinkNotice | null; onCancel: () => void; onContinue: () => void }) {
  return (
    <Dialog open={notice !== null} onClose={onCancel} title={notice?.title ?? ""} description={notice?.body} className="sm:max-w-md">
      <div className="space-y-4">
        <p className="text-sm font-medium" role="status">{notice?.remaining}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onContinue} data-autofocus>
            {notice?.continueLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
