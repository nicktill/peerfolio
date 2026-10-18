"use client"

import { useState } from "react"
import { SPORT_LABEL } from "@web/lib/sports/format"

const BRANDED = new Set(["nfl", "nba", "nhl", "mlb", "mls", "cfb"])

/** Locally cached ESPN league marks, alongside readable labels and a text fallback. */
export function LeagueBrand({ sport, iconOnly = false }: { sport: string; iconOnly?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null)
  const hasLogo = BRANDED.has(sport) && failed !== sport
  return (
    <span className="sp-league-brand" title={iconOnly ? (SPORT_LABEL[sport] ?? sport) : undefined}>
      {sport === "tennis" ? <svg className="sp-tennis-mark" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="#b8c378"/><path d="M5.8 4.8C12 8.5 12 15.5 5.8 19.2M18.2 4.8C12 8.5 12 15.5 18.2 19.2" fill="none" stroke="#f6f7e9" strokeWidth="1.6" strokeLinecap="round"/></svg> : hasLogo ? (
        <span className="sp-league-mark" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sp-league-light" src={`/sports/leagues/${sport}.png`} alt="" width={20} height={20} loading="lazy" onError={() => setFailed(sport)} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sp-league-dark" src={`/sports/leagues/${sport}-dark.png`} alt="" width={20} height={20} loading="lazy" onError={() => setFailed(sport)} />
        </span>
      ) : null}
      {iconOnly ? <span className="sr-only">{SPORT_LABEL[sport] ?? sport}</span> : <span>{sport === "cfb" ? "CFB" : SPORT_LABEL[sport] ?? sport}</span>}
    </span>
  )
}
