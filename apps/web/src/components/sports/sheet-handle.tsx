"use client"

import { useRef } from "react"

/** The grab bar on the phone pick sheet: tap it or drag the sheet down to tuck it away (the pick stays on the slip). */
export function SheetHandle({ onMinimize, disabled, label = "Minimize pick slip" }: { onMinimize: () => void; disabled?: boolean; label?: string }) {
  const start = useRef<number | null>(null)
  const dragged = useRef(false)
  const sheet = (el: HTMLElement) => el.closest<HTMLElement>(".sp-sheet")
  const drop = (el: HTMLElement) => {
    const s = sheet(el)
    if (!s) return
    s.removeAttribute("data-dragging")
    s.style.removeProperty("--sheet-drag")
  }
  return (
    <button
      type="button"
      className="sp-sheet-handle"
      aria-label={label}
      disabled={disabled}
      onClick={() => { const wasDragged = dragged.current; dragged.current = false; if (!wasDragged) onMinimize() }}
      onPointerDown={(event) => {
        if (disabled) return
        dragged.current = false
        start.current = event.clientY
        event.currentTarget.setPointerCapture(event.pointerId)
        sheet(event.currentTarget)?.setAttribute("data-dragging", "")
      }}
      onPointerMove={(event) => {
        if (start.current == null) return
        sheet(event.currentTarget)?.style.setProperty("--sheet-drag", `${Math.max(0, event.clientY - start.current)}px`)
      }}
      onPointerUp={(event) => {
        const distance = start.current == null ? 0 : event.clientY - start.current
        dragged.current = Math.abs(distance) > 5
        start.current = null
        drop(event.currentTarget)
        if (distance >= 60) onMinimize()
        // A short drag springs back instead of counting as a tap.
        if (distance > 5) event.preventDefault()
      }}
      onPointerCancel={(event) => { start.current = null; dragged.current = false; drop(event.currentTarget) }}
    ><span /></button>
  )
}
