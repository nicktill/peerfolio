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

/**
 * A crest is a drawn mark instead of an emoji, stored in the same field as
 * "crest:<shape>:<glyph>:<effect>:<backdrop>". The last two are optional.
 */
export const CREST_SHAPES = ["shield", "circle", "hex", "diamond"] as const
export const CREST_GLYPHS = [
  "trophy", "flame", "zap", "crown", "rocket", "shield", "star", "swords", "target", "gem", "anchor", "skull", "ghost", "bird", "fish", "mountain",
  "sun", "moon", "heart", "flag", "compass", "atom", "clover", "dices", "lightbulb", "paw", "dog", "cat", "rabbit", "turtle", "bug", "snowflake",
  "waves", "leaf", "coins", "trending", "sparkles", "medal", "gamepad", "dumbbell",
] as const
export const CREST_EFFECTS = ["still", "glow", "float", "shimmer"] as const
export const BACKDROPS = ["none", "aurora", "ticker", "confetti", "grid", "stars"] as const
export type CrestShape = (typeof CREST_SHAPES)[number]
export type CrestEffect = (typeof CREST_EFFECTS)[number]
export type Backdrop = (typeof BACKDROPS)[number]

export type Crest = { shape: CrestShape; glyph: string; effect: CrestEffect; backdrop: Backdrop }

const has = <T extends string>(list: readonly T[], v: string | undefined): v is T => !!v && (list as readonly string[]).includes(v)

/** Reads a stored look; null when it is a plain emoji (or anything else). */
export function parseCrest(value: string): Crest | null {
  if (!value.startsWith("crest:")) return null
  const [, shape, glyph, effect = "still", backdrop = "none", extra] = value.split(":")
  if (extra !== undefined || !has(CREST_SHAPES, shape) || !has(CREST_GLYPHS, glyph) || !has(CREST_EFFECTS, effect) || !has(BACKDROPS, backdrop)) return null
  return { shape, glyph, effect, backdrop }
}

export const crestToken = (c: Crest): string => `crest:${c.shape}:${c.glyph}:${c.effect}:${c.backdrop}`

export const isLeagueEmoji = (value: string) => ALL_EMOJIS.has(value) || parseCrest(value) !== null

/** Accent colours as hex, for drawn marks. */
export const ACCENT_HEX: Record<AccentKey, { base: string; deep: string }> = {
  emerald: { base: "#3fae7f", deep: "#1f6b4c" },
  violet: { base: "#8f6fe0", deep: "#4b3a9a" },
  amber: { base: "#e0a23f", deep: "#8a5a10" },
  sky: { base: "#4aa3e0", deep: "#1f5f93" },
  rose: { base: "#e0607a", deep: "#8f2b42" },
}

/** A random logo and colour, for the "Surprise me" button. `rand` returns [0, 1). */
export function randomLook(rand: () => number = Math.random): { emoji: string; accent: AccentKey } {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!
  const accent = pick(ACCENT_KEYS)
  // Half the time a drawn crest with some life in it, otherwise an emoji.
  if (rand() < 0.5) return { emoji: crestToken({ shape: pick(CREST_SHAPES), glyph: pick(CREST_GLYPHS), effect: pick(CREST_EFFECTS), backdrop: pick(BACKDROPS) }), accent }
  return { emoji: pick([...ALL_EMOJIS]), accent }
}
