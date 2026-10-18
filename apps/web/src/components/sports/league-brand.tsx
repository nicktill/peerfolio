"use client"

import { useState } from "react"
import { SPORT_LABEL } from "@web/lib/sports/format"

/** Leagues whose marks are cached under /public/sports/leagues. */
const BRANDED = new Set(["nfl", "nba", "nhl", "mlb", "mls", "cfb"])

/** Newer leagues use ESPN's own hosted league mark (light and dark variants) instead of a cached copy. */
const ESPN = "https://a.espncdn.com/i"
const REMOTE: Record<string, { light: string; dark: string }> = {
  epl: { light: `${ESPN}/leaguelogos/soccer/500/23.png`, dark: `${ESPN}/leaguelogos/soccer/500-dark/23.png` },
  laliga: { light: `${ESPN}/leaguelogos/soccer/500/15.png`, dark: `${ESPN}/leaguelogos/soccer/500-dark/15.png` },
  ucl: { light: `${ESPN}/leaguelogos/soccer/500/2.png`, dark: `${ESPN}/leaguelogos/soccer/500-dark/2.png` },
  wnba: { light: `${ESPN}/teamlogos/leagues/500/wnba.png`, dark: `${ESPN}/teamlogos/leagues/500-dark/wnba.png` },
  ncaab: { light: "https://a.espncdn.com/redesign/assets/img/icons/NCAASports_MensBasketball.png", dark: "https://a.espncdn.com/redesign/assets/img/icons/NCAASports_MensBasketball.png" },
}

/** League marks, alongside readable labels and a text fallback. */
export function LeagueBrand({ sport, iconOnly = false }: { sport: string; iconOnly?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null)
  const remote = REMOTE[sport]
  const hasLogo = (BRANDED.has(sport) || remote != null) && failed !== sport
  const light = remote?.light ?? `/sports/leagues/${sport}.png`
  const dark = remote?.dark ?? `/sports/leagues/${sport}-dark.png`
  return (
    <span className="sp-league-brand" title={iconOnly ? (SPORT_LABEL[sport] ?? sport) : undefined}>
      {sport === "tennis" ? <svg className="sp-tennis-mark" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="#b8c378"/><path d="M5.8 4.8C12 8.5 12 15.5 5.8 19.2M18.2 4.8C12 8.5 12 15.5 18.2 19.2" fill="none" stroke="#f6f7e9" strokeWidth="1.6" strokeLinecap="round"/></svg> : hasLogo ? (
        <span className="sp-league-mark" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sp-league-light" src={light} alt="" width={20} height={20} loading="lazy" onError={() => setFailed(sport)} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sp-league-dark" src={dark} alt="" width={20} height={20} loading="lazy" onError={() => setFailed(sport)} />
        </span>
      ) : null}
      {iconOnly ? <span className="sr-only">{SPORT_LABEL[sport] ?? sport}</span> : <span>{sport === "cfb" ? "CFB" : SPORT_LABEL[sport] ?? sport}</span>}
    </span>
  )
}
