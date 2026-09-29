"use client"

import { useEffect, useRef, useState } from "react"

const key = (leagueId: string) => `peerfolio:rank:${leagueId}`

/**
 * The rank you had when you last opened this league, held steady for the whole
 * visit so refreshes don't erase the movement. The current rank is saved as
 * the next visit's baseline. Storage can be blocked or empty; then there is
 * simply no baseline and nothing is shown.
 */
export function useRankBaseline(leagueId: string, rank: number | null): number | null {
  const [baseline, setBaseline] = useState<number | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (rank === null) return
    if (!started.current) {
      started.current = true
      try {
        const stored = Number(window.localStorage.getItem(key(leagueId)))
        if (Number.isFinite(stored) && stored >= 1) setBaseline(stored)
      } catch {
        // Private mode or blocked storage: no baseline this time.
      }
    }
    try {
      window.localStorage.setItem(key(leagueId), String(rank))
    } catch {
      // Same: nothing to save to.
    }
  }, [leagueId, rank])

  return baseline
}
