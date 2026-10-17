"use client"

import "@web/components/sports/mode-switch.css"

import { useCallback, useEffect, useRef, useState } from "react"
import { sportsEnabled } from "@web/lib/sports/flag"

export type FantasyMode = "stocks" | "sports"

const KEY = "pf.fantasy.mode"
const MODES: FantasyMode[] = ["stocks", "sports"]
export const MODE_PANEL_ID = "fantasy-mode-panel"
export const modeTabId = (mode: FantasyMode) => `fantasy-mode-${mode}`

/**
 * Which side of Fantasy is showing, remembered per browser. Stocks is the
 * default and the only option unless the `sportsEnabled` flag is on, so
 * existing users see no change. Storage can be blocked, so every access is guarded.
 */
export function useFantasyMode(): [FantasyMode, (mode: FantasyMode) => void] {
  const [mode, setMode] = useState<FantasyMode>("stocks")
  useEffect(() => {
    if (!sportsEnabled()) return
    try {
      if (window.localStorage.getItem(KEY) === "sports") setMode("sports")
    } catch {
      /* storage blocked: stay on Stocks */
    }
  }, [])
  const choose = useCallback((next: FantasyMode) => {
    setMode(next)
    try {
      window.localStorage.setItem(KEY, next)
    } catch {
      /* not remembered, still works */
    }
  }, [])
  return [sportsEnabled() ? mode : "stocks", choose]
}

/**
 * A real tablist: roving tabindex, arrow keys / Home / End move and select,
 * and the selected tab controls the panel the page wraps in MODE_PANEL_ID.
 */
export function ModeSwitch({ mode, onChange }: { mode: FantasyMode; onChange: (mode: FantasyMode) => void }) {
  const refs = useRef<Record<FantasyMode, HTMLButtonElement | null>>({ stocks: null, sports: null })
  if (!sportsEnabled()) return null

  function onKeyDown(event: React.KeyboardEvent) {
    const i = MODES.indexOf(mode)
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? MODES[(i + 1) % MODES.length]
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? MODES[(i + MODES.length - 1) % MODES.length]
      : event.key === "Home" ? MODES[0]
      : event.key === "End" ? MODES[MODES.length - 1]
      : null
    if (!next) return
    event.preventDefault()
    onChange(next)
    refs.current[next]?.focus()
  }

  return (
    <div className="sp-mode" role="tablist" aria-label="Fantasy type" data-mode={mode} onKeyDown={onKeyDown}>
      {MODES.map((m) => (
        <button
          key={m}
          ref={(el) => {
            refs.current[m] = el
          }}
          type="button"
          role="tab"
          id={modeTabId(m)}
          aria-selected={mode === m}
          aria-controls={MODE_PANEL_ID}
          tabIndex={mode === m ? 0 : -1}
          onClick={() => onChange(m)}
        >
          {m === "stocks" ? "Stocks" : "Sports"}
        </button>
      ))}
    </div>
  )
}

/** The tabpanel the switch controls. With the flag off it adds nothing at all (a fragment). */
export function ModePanel({ mode, children }: { mode: FantasyMode; children: React.ReactNode }) {
  if (!sportsEnabled()) return <>{children}</>
  return (
    <div className="fw" role="tabpanel" id={MODE_PANEL_ID} aria-labelledby={modeTabId(mode)}>
      {children}
    </div>
  )
}
