"use client"

import { useEffect, useId, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Card } from "@web/components/ui/card"
import { cn } from "@web/lib/utils"

/**
 * A card whose body folds away under its title, for long lists. The choice is remembered in this
 * browser under `storageKey`. `revealKey` opens it when it changes (a link elsewhere on the page that
 * wants this section shown). Collapsed content is hidden from keyboard and screen readers, not just sight.
 */
export function CollapsibleCard({
  id,
  title,
  summary,
  defaultOpen = true,
  storageKey,
  revealKey,
  className,
  children,
}: {
  id?: string
  title: React.ReactNode
  /** Shown beside the title while collapsed, e.g. a count. */
  summary?: React.ReactNode
  defaultOpen?: boolean
  storageKey?: string
  revealKey?: string
  className?: string
  children: React.ReactNode
}) {
  const bodyId = useId()
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    if (!storageKey) return
    try {
      const saved = localStorage.getItem(`pf-collapse:${storageKey}`)
      if (saved === "1" || saved === "0") setOpen(saved === "1")
    } catch {
      // Storage blocked: the default holds.
    }
  }, [storageKey])

  const [seen, setSeen] = useState(revealKey)
  useEffect(() => {
    if (revealKey !== seen) {
      setSeen(revealKey)
      setOpen(true)
    }
  }, [revealKey, seen])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (!storageKey) return
    try {
      localStorage.setItem(`pf-collapse:${storageKey}`, next ? "1" : "0")
    } catch {
      // Not remembered; it still works for this visit.
    }
  }

  return (
    <Card id={id} className={cn("scroll-mt-20", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
      >
        <span className="min-w-0 flex-1">{title}</span>
        {!open && summary ? <span className="numeric shrink-0 text-xs text-muted-foreground">{summary}</span> : null}
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out", !open && "-rotate-90")} />
      </button>
      <div
        id={bodyId}
        className="grid motion-reduce:transition-none"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          visibility: open ? "visible" : "hidden",
          transition: `grid-template-rows 0.3s cubic-bezier(0.22, 1, 0.36, 1), visibility 0s linear ${open ? "0s" : "0.3s"}`,
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-4 px-5 pb-5">{children}</div>
        </div>
      </div>
    </Card>
  )
}
