import "@web/components/league/league-mark.css"

import {
  Anchor, Atom, Bird, Bug, Cat, Clover, Coins, Compass, Crown, Dices, Dog, Dumbbell, Fish, Flag, Flame, Gamepad2, Gem, Ghost, Heart, Leaf, Lightbulb, Medal, Moon, Mountain,
  PawPrint, Rabbit, Rocket, Shield, Skull, Snowflake, Sparkles, Star, Sun, Swords, Target, TrendingUp, Trophy, Turtle, Waves, Zap,
  type LucideIcon,
} from "lucide-react"
import { ACCENT_HEX, ACCENT_KEYS, parseCrest, type AccentKey, type Backdrop } from "@web/lib/league-look"

export const GLYPHS: Record<string, LucideIcon> = {
  trophy: Trophy, flame: Flame, zap: Zap, crown: Crown, rocket: Rocket, shield: Shield, star: Star, swords: Swords, target: Target, gem: Gem, anchor: Anchor, skull: Skull,
  ghost: Ghost, bird: Bird, fish: Fish, mountain: Mountain, sun: Sun, moon: Moon, heart: Heart, flag: Flag, compass: Compass, atom: Atom, clover: Clover, dices: Dices,
  lightbulb: Lightbulb, paw: PawPrint, dog: Dog, cat: Cat, rabbit: Rabbit, turtle: Turtle, bug: Bug, snowflake: Snowflake, waves: Waves, leaf: Leaf, coins: Coins,
  trending: TrendingUp, sparkles: Sparkles, medal: Medal, gamepad: Gamepad2, dumbbell: Dumbbell,
}

const SHAPES: Record<string, string> = {
  shield: "M32 4 56 12v20c0 14-10 24-24 28C18 56 8 46 8 32V12z",
  circle: "M32 4a28 28 0 1 1 0 56 28 28 0 0 1 0-56z",
  hex: "M32 3 57 17.5v29L32 61 7 46.5v-29z",
  diamond: "M32 3 59 32 32 61 5 32z",
}

const hexOf = (accent: string) => ACCENT_HEX[(ACCENT_KEYS as readonly string[]).includes(accent) ? (accent as AccentKey) : "emerald"]

/** What the page's decorative watermark should print: the emoji, or nothing for a drawn crest. */
export const watermark = (value: string) => (parseCrest(value) ? "" : value)

/**
 * A league's mark: its emoji, or a drawn crest (shape, glyph, optional glow, float or shimmer)
 * in the league's colour. Renders on the server too, so share pages and previews can use it.
 */
export function LeagueMark({ value, accent, size = 40, className }: { value: string; accent: string; size?: number; className?: string }) {
  const crest = parseCrest(value)
  if (!crest) {
    return (
      <span className={className} style={{ fontSize: size * 0.55, lineHeight: 1 }} aria-hidden>
        {value}
      </span>
    )
  }
  const { base, deep } = hexOf(accent)
  const Glyph = GLYPHS[crest.glyph] ?? Trophy
  const id = `lm-${crest.shape}-${accent}`
  return (
    <span className={`lm ${className ?? ""}`} data-fx={crest.effect} style={{ width: size, height: size }} aria-hidden>
      <svg className="lm-shape" viewBox="0 0 64 64" width={size} height={size}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={base} />
            <stop offset="1" stopColor={deep} />
          </linearGradient>
          <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".5" />
            <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={SHAPES[crest.shape]} fill={`url(#${id})`} />
        <path d={SHAPES[crest.shape]} fill={`url(#${id}-s)`} />
        <path d={SHAPES[crest.shape]} fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth="1.5" transform="translate(32 32) scale(.86) translate(-32 -32)" />
        <path d={SHAPES[crest.shape]} fill="none" stroke="#000" strokeOpacity=".25" strokeWidth="1" />
      </svg>
      <Glyph className="lm-glyph" style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={2.2} />
      {crest.effect === "shimmer" ? <i className="lm-shine" /> : null}
    </span>
  )
}

const TICKERS = ["NVDA +2.4%", "AAPL −0.3%", "TSLA +5.1%", "MSFT +0.9%", "AMZN +1.7%", "META −1.2%", "GOOGL +0.6%", "COIN +8.8%", "SPY +0.4%", "PLTR +3.3%"]

/** Moving scenery behind a league's header, chosen with the crest. CSS only, and still when motion is reduced. */
export function LeagueBackdrop({ value }: { value: string }) {
  const backdrop: Backdrop = parseCrest(value)?.backdrop ?? "none"
  if (backdrop === "none") return null
  return (
    <div className="lb" data-kind={backdrop} aria-hidden>
      {backdrop === "ticker" ? (
        <div className="lb-tape">
          {[...TICKERS, ...TICKERS].map((t, i) => (
            <span key={i} data-down={t.includes("−") || undefined}>
              {t}
            </span>
          ))}
        </div>
      ) : null}
      {backdrop === "confetti" ? Array.from({ length: 16 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />) : null}
      {backdrop === "stars" ? Array.from({ length: 26 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />) : null}
    </div>
  )
}
