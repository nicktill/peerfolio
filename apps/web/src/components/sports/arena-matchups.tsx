"use client"

import { useEffect, useState } from "react"
import { TeamBadge } from "@web/components/sports/team-badge"

function Typed({ text }: { text: string }) {
  return (
    <span key={text} className="roll">
      {text}
    </span>
  )
}

const MATCHUPS: { sport: string; a: string; b: string; start: [number, number]; step: number[] }[] = [
  { sport: "nfl", a: "Philadelphia Eagles", b: "Carolina Panthers", start: [24, 17], step: [3, 7] },
  { sport: "nhl", a: "Boston Bruins", b: "Toronto Maple Leafs", start: [3, 2], step: [1] },
  { sport: "mlb", a: "Los Angeles Dodgers", b: "New York Yankees", start: [5, 4], step: [1, 2] },
]

/** Teams facing off over the Sports panel: logos, a score that changes now and then, and a gentle float. */
export function ArenaMatchups() {
  const [scores, setScores] = useState(() => MATCHUPS.map((m) => [...m.start]))
  const [flash, setFlash] = useState<{ i: number; side: number } | null>(null)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = setInterval(() => {
      const i = Math.floor(Math.random() * MATCHUPS.length)
      const side = Math.random() < 0.5 ? 0 : 1
      const step = MATCHUPS[i]!.step[Math.floor(Math.random() * MATCHUPS[i]!.step.length)]!
      setScores((cur) => cur.map((s, k) => (k === i ? s.map((v, j) => (j === side ? v + step : v)) : s)))
      setFlash({ i, side })
      setTimeout(() => setFlash(null), 1200)
    }, 3200)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="am">
      {MATCHUPS.map((m, i) => (
        <span key={i} className="am-card" data-k={i}>
          <TeamBadge sport={m.sport} name={m.a} size={28} bare />
          <b className="numeric" data-hot={(flash?.i === i && flash.side === 0) || undefined}>
            <Typed text={String(scores[i]![0])} />
          </b>
          <i>vs</i>
          <b className="numeric" data-hot={(flash?.i === i && flash.side === 1) || undefined}>
            <Typed text={String(scores[i]![1])} />
          </b>
          <TeamBadge sport={m.sport} name={m.b} size={28} bare />
        </span>
      ))}
    </span>
  )
}
