"use client"

import "@web/components/fantasy/fantasy-workspace.css"
import "@web/components/sports/sports-workspace.css"

import { useCallback, useEffect, useState } from "react"
import { sportsEnabled } from "@web/lib/sports/flag"

export type FantasyMode = "stocks" | "sports"

const KEY = "pf.fantasy.mode"

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

export function ModeSwitch({ mode, onChange }: { mode: FantasyMode; onChange: (mode: FantasyMode) => void }) {
  if (!sportsEnabled()) return null
  return (
    <div className="sp-mode" role="tablist" aria-label="Fantasy type" data-mode={mode}>
      <button type="button" role="tab" aria-selected={mode === "stocks"} onClick={() => onChange("stocks")}>
        Stocks
      </button>
      <button type="button" role="tab" aria-selected={mode === "sports"} onClick={() => onChange("sports")}>
        Sports
      </button>
    </div>
  )
}
