"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Dialog } from "@web/components/ui/dialog"

export type ConfirmOptions = {
  title: string
  description?: string
  /** Label of the confirming button. */
  confirmLabel?: string
  /** "danger" for things that delete or disconnect. */
  tone?: "danger" | "default"
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

/**
 * A styled replacement for `window.confirm`: `const confirm = useConfirm()`,
 * then `if (!(await confirm({ title: "Remove Cash?", tone: "danger" }))) return`.
 * Escape, the backdrop and Cancel all answer no.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((answer: boolean) => void) | null>(null)

  const confirm = useCallback<Confirm>((next) => {
    // A second request while one is open answers the first with no.
    resolver.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  function settle(answer: boolean) {
    resolver.current?.(answer)
    resolver.current = null
    setOptions(null)
  }

  const danger = options?.tone === "danger"

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={options !== null} onClose={() => settle(false)} title={options?.title ?? ""} description={options?.description} className="sm:max-w-md">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => settle(false)}>
            Cancel
          </Button>
          <Button variant={danger ? "destructive" : "default"} onClick={() => settle(true)} data-autofocus>
            {danger ? <AlertTriangle aria-hidden /> : null}
            {options?.confirmLabel ?? (danger ? "Remove" : "Confirm")}
          </Button>
        </div>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error("useConfirm needs a <ConfirmProvider> above it")
  return confirm
}
