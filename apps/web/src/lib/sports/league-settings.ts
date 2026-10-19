import { checkEndChange } from "../fantasy-rules.ts"
import { isSportEnabled } from "./enabled.ts"
import { SPORTS, type Sport } from "./types.ts"

/** Share of starting cash one pick or parlay may risk (singles are further capped by the total-exposure limit). */
export const STAKE_PCT_RANGE = { min: 1, max: 60 } as const

export type LeagueSettingsPatch = {
  maxParlayStakePct?: number | null
  sports?: string[]
  endsAt?: Date | null
}

export type LeagueSettingsCurrent = { endsAt: Date | null; sports: string[] }

/**
 * Rules for the owner settings that are not plain text: the parlay limit, the sports on offer and the end date.
 * Pure, so the tests can run it without a database. Returns a message for the first problem, or null.
 *
 * Removing a sport only stops new lines for it; picks already placed still settle (settlement never reads the league's sport list).
 */
export function checkLeagueSettings(patch: LeagueSettingsPatch, current: LeagueSettingsCurrent, now = new Date()): string | null {
  const pct = patch.maxParlayStakePct
  if (pct !== undefined && pct !== null && (!Number.isInteger(pct) || pct < STAKE_PCT_RANGE.min || pct > STAKE_PCT_RANGE.max)) {
    return `Choose a whole number from ${STAKE_PCT_RANGE.min} to ${STAKE_PCT_RANGE.max}`
  }
  if (patch.sports !== undefined) {
    const picked = patch.sports
    if (picked.length === 0) return "Keep at least one sport"
    if (new Set(picked).size !== picked.length) return "Each sport can only be listed once"
    const known = new Set<string>(SPORTS)
    for (const sport of picked) {
      if (!known.has(sport)) return "That sport isn't supported"
      // A paused sport cannot be newly added, but one the league already has may stay.
      if (!current.sports.includes(sport) && !isSportEnabled(sport)) return "That sport is paused right now"
    }
  }
  if (patch.endsAt !== undefined) return checkEndChange(current.endsAt, patch.endsAt, now)
  return null
}

export const asSports = (list: string[]): Sport[] => list as Sport[]
