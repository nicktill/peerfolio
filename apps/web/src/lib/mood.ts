"use client"

import { useEffect, useState } from "react"

/** What kind of day the portfolio is having, which tints the app's ambient background. */
export type Mood = "up" | "down" | "flat"

/** Moves smaller than this read as a flat day, not a green or red one. */
const FLAT_BELOW_PERCENT = 0.05

export function moodFromPercent(percent: number | null | undefined): Mood {
  if (percent == null || !Number.isFinite(percent) || Math.abs(percent) < FLAT_BELOW_PERCENT) return "flat"
  return percent > 0 ? "up" : "down"
}

const KEY = "peerfolio:mood-override"
const isMood = (value: string | null): value is Mood => value === "up" || value === "down" || value === "flat"

/**
 * Lets `?mood=up|down|flat` force a mood, and remembers it for the tab, so the tinted backgrounds can be
 * looked at on a demo account or a quiet day. `?mood=off` clears it. Purely cosmetic.
 */
export function useMoodOverride(): Mood | null {
  const [override, setOverride] = useState<Mood | null>(null)
  useEffect(() => {
    try {
      const param = new URLSearchParams(window.location.search).get("mood")
      if (param === "off") sessionStorage.removeItem(KEY)
      else if (isMood(param)) sessionStorage.setItem(KEY, param)
      const stored = sessionStorage.getItem(KEY)
      setOverride(isMood(stored) ? stored : null)
    } catch {
      setOverride(null)
    }
  }, [])
  return override
}
