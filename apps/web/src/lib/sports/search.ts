import { SPORT_LABEL } from "./format.ts"

/** Lowercase, accent-free, single-spaced text for forgiving matching ("Djoković" matches "djokovic"). */
export const normalizeSearch = (text: string): string => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()

/** True when every word of the query appears in the game's teams / players, its league key or its league name. */
export function matchesSearch(query: string, parts: (string | null | undefined)[], sport?: string): boolean {
  const words = normalizeSearch(query).split(" ").filter(Boolean)
  if (words.length === 0) return true
  const hay = normalizeSearch([...parts, sport, sport ? SPORT_LABEL[sport] : null].filter(Boolean).join(" "))
  return words.every((w) => hay.includes(w))
}
