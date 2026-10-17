"use client"

import "@web/components/ui/tip.css"

import { useId, useState } from "react"
import { Info } from "lucide-react"

/** Wrap anything to give it a hover/focus/tap explanation. Keyboard reachable; Escape closes. */
export function Tip({ text, children, side = "top", inline, block }: { text: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom"; inline?: boolean; block?: boolean }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <span
      className="tip"
      data-inline={inline || undefined}
      data-block={block || undefined}
      data-open={open || undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      <span role="tooltip" id={id} className="tip-bubble" data-side={side}>
        {text}
      </span>
    </span>
  )
}

/** A small "?" that opens an explanation. Taps work on touch screens. */
export function InfoTip({ text, label = "More info", side = "top" }: { text: React.ReactNode; label?: string; side?: "top" | "bottom" }) {
  const [pinned, setPinned] = useState(false)
  return (
    <Tip text={text} side={side} inline>
      <button type="button" className="tip-info" aria-label={label} aria-expanded={pinned} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPinned(!pinned) }} onBlur={() => setPinned(false)} data-pinned={pinned || undefined}>
        <Info aria-hidden />
      </button>
    </Tip>
  )
}
