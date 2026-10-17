"use client"

import { useState } from "react"
import { SPORT_LABEL } from "@web/lib/sports/format"

const BRANDED = new Set(["nfl", "nba", "nhl", "mlb", "mls", "cfb"])

/** Locally cached ESPN league marks, alongside readable labels and a text fallback. */
export function LeagueBrand({ sport }: { sport: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const hasLogo = BRANDED.has(sport) && failed !== sport
  return (
    <span className="sp-league-brand">
      {hasLogo ? (
        <span className="sp-league-mark" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sp-league-light" src={`/sports/leagues/${sport}.png`} alt="" width={20} height={20} loading="lazy" onError={() => setFailed(sport)} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sp-league-dark" src={`/sports/leagues/${sport}-dark.png`} alt="" width={20} height={20} loading="lazy" onError={() => setFailed(sport)} />
        </span>
      ) : null}
      <span>{sport === "cfb" ? "CFB" : SPORT_LABEL[sport] ?? sport}</span>
    </span>
  )
}
