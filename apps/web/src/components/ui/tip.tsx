"use client"

import "@web/components/ui/tip.css"

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Info } from "lucide-react"

/**
 * Wrap anything to give it a hover/focus/tap explanation. The bubble is drawn in a portal with fixed
 * positioning, so a card with overflow hidden can never clip it. Keyboard reachable; Escape closes.
 */
export function Tip({ text, children, side = "top", inline, block }: { text: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom"; inline?: boolean; block?: boolean }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; flip: boolean } | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (!open || !anchor.current || !bubble.current) return
    const a = anchor.current.getBoundingClientRect()
    const b = bubble.current.getBoundingClientRect()
    const margin = 8
    const wantTop = side === "top"
    const fitsTop = a.top - b.height - margin > 8
    const fitsBottom = a.bottom + b.height + margin < window.innerHeight - 8
    const flip = wantTop ? !fitsTop && fitsBottom : !(!fitsBottom && fitsTop)
    const below = wantTop ? flip : !flip
    const left = Math.min(Math.max(a.left + a.width / 2 - b.width / 2, 8), window.innerWidth - b.width - 8)
    const top = below ? a.bottom + margin : a.top - b.height - margin
    setPos({ left, top, flip: below })
  }, [open, side, text])

  // Touch has no mouseleave: a tap anywhere else closes the bubble.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", away)
    return () => document.removeEventListener("pointerdown", away)
  }, [open])

  return (
    <span
      className="tip"
      ref={anchor}
      data-inline={inline || undefined}
      data-block={block || undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && typeof document !== "undefined"
        ? createPortal(
            <span ref={bubble} role="tooltip" id={id} className="tip-bubble" data-below={pos?.flip || undefined} data-ready={pos ? "" : undefined} style={{ left: pos?.left ?? 0, top: pos?.top ?? 0 }}>
              {text}
            </span>,
            document.body,
          )
        : null}
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
