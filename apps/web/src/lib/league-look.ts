/**
 * How a league looks: a logo from a curated set and an accent colour.
 *
 * Plain data and no imports, so the API can validate against the same list the
 * picker shows and the tests can run it directly. Every emoji ever offered stays
 * in here, so a league made with an older set never stops matching.
 */

export const EMOJI_GROUPS = [
  { label: "Sports", emojis: ["🏈", "🏀", "⚾", "⚽", "🏒", "🎾", "🥊", "⛳", "🎯", "🏆"] },
  { label: "Money & markets", emojis: ["💎", "💰", "💸", "🤑", "📈", "📉", "🏦", "🪙", "💵", "🐂", "🐻", "🚀"] },
  { label: "Animals", emojis: ["🦍", "🐺", "🦈", "🦁", "🐉", "🦅", "🐸", "🦄", "🐙", "🦊", "🐢", "🦉"] },
  { label: "Good chaos", emojis: ["🎰", "🔥", "⚡", "🌙", "👑", "🧠", "🎲", "🍿", "🤖", "👽", "🧨", "🍀"] },
] as const

export const ACCENT_KEYS = ["emerald", "violet", "amber", "sky", "rose"] as const
export type AccentKey = (typeof ACCENT_KEYS)[number]

/** Full class names, written out, so Tailwind sees them. */
export const ACCENTS: Record<AccentKey, { label: string; swatch: string; gradient: string; glow: string }> = {
  emerald: { label: "Emerald", swatch: "bg-emerald-500", gradient: "from-emerald-500/20", glow: "bg-emerald-500/20" },
  violet: { label: "Violet", swatch: "bg-violet-500", gradient: "from-violet-500/20", glow: "bg-violet-500/20" },
  amber: { label: "Amber", swatch: "bg-amber-500", gradient: "from-amber-500/20", glow: "bg-amber-500/20" },
  sky: { label: "Sky", swatch: "bg-sky-500", gradient: "from-sky-500/20", glow: "bg-sky-500/20" },
  rose: { label: "Rose", swatch: "bg-rose-500", gradient: "from-rose-500/20", glow: "bg-rose-500/20" },
}

const ALL_EMOJIS: ReadonlySet<string> = new Set(EMOJI_GROUPS.flatMap((g) => g.emojis))

export const isLeagueEmoji = (value: string) => ALL_EMOJIS.has(value)

export const accentFor = (key: string | null | undefined) => ACCENTS[(key as AccentKey) ?? "emerald"] ?? ACCENTS.emerald

/** A random logo and colour, for the "Surprise me" button. `rand` returns [0, 1). */
export function randomLook(rand: () => number = Math.random): { emoji: string; accent: AccentKey } {
  const all = [...ALL_EMOJIS]
  return { emoji: all[Math.floor(rand() * all.length)]!, accent: ACCENT_KEYS[Math.floor(rand() * ACCENT_KEYS.length)]! }
}
