"use client"

import { useState } from "react"
import { Dices } from "lucide-react"
import { GLYPHS, LeagueBackdrop, LeagueMark } from "@web/components/league/league-mark"
import {
  ACCENTS, ACCENT_KEYS, BACKDROPS, CREST_EFFECTS, CREST_GLYPHS, CREST_SHAPES, EMOJI_GROUPS, crestToken, parseCrest, randomLook,
  type AccentKey, type Backdrop, type Crest, type CrestEffect, type CrestShape,
} from "@web/lib/league-look"

export type Look = { emoji: string; accent: string }

const EFFECT_LABEL: Record<CrestEffect, string> = { still: "Still", glow: "Glow", float: "Float", shimmer: "Shimmer" }
const BACKDROP_LABEL: Record<Backdrop, string> = { none: "None", aurora: "Aurora", ticker: "Ticker", confetti: "Confetti", grid: "Grid", stars: "Stars" }
const DEFAULT_CREST: Crest = { shape: "shield", glyph: "trophy", effect: "glow", backdrop: "aurora" }

/**
 * Pick a league's mark and colour, with a live preview of its banner. A mark is either a drawn
 * crest (shape, glyph, effect, and moving scenery) or an emoji. Used when creating a league and
 * when the owner edits it.
 */
export function LookPicker({ look, name, onChange }: { look: Look; name: string; onChange: (look: Look) => void }) {
  const crest = parseCrest(look.emoji)
  const [tab, setTab] = useState<"crest" | "emoji">(crest || look.emoji === "" ? "crest" : "emoji")
  const setCrest = (patch: Partial<Crest>) => onChange({ ...look, emoji: crestToken({ ...(crest ?? DEFAULT_CREST), ...patch }) })

  return (
    <div className="fw-look" data-accent={look.accent}>
      <div className="lp-preview" data-accent={look.accent}>
        <LeagueBackdrop value={look.emoji} />
        <span className="lp-mark" key={look.emoji}>
          <LeagueMark value={look.emoji} accent={look.accent} size={72} />
        </span>
        <div className="lp-name">
          <p>{name.trim() || "Your league"}</p>
          <span>How it looks on your league page</span>
        </div>
        <button type="button" className="fw-btn" onClick={() => onChange(randomLook())}>
          <Dices aria-hidden />
          Surprise me
        </button>
      </div>

      <div className="lp-tabs" role="tablist" aria-label="Mark type">
        <button type="button" role="tab" aria-selected={tab === "crest"} onClick={() => { setTab("crest"); if (!crest) onChange({ ...look, emoji: crestToken(DEFAULT_CREST) }) }}>
          Crest
        </button>
        <button type="button" role="tab" aria-selected={tab === "emoji"} onClick={() => setTab("emoji")}>
          Emoji
        </button>
      </div>

      {tab === "crest" ? (
        <>
          <fieldset>
            <legend>Shape</legend>
            <div className="lp-shapes">
              {CREST_SHAPES.map((shape: CrestShape) => (
                <button key={shape} type="button" aria-pressed={crest?.shape === shape} aria-label={`${shape} crest`} onClick={() => setCrest({ shape })}>
                  <LeagueMark value={crestToken({ ...(crest ?? DEFAULT_CREST), shape, effect: "still" })} accent={look.accent} size={44} />
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Symbol</legend>
            <div className="lp-glyphs">
              {CREST_GLYPHS.map((glyph) => {
                const Icon = GLYPHS[glyph]!
                return (
                  <button key={glyph} type="button" aria-pressed={crest?.glyph === glyph} aria-label={glyph} title={glyph} onClick={() => setCrest({ glyph })}>
                    <Icon aria-hidden />
                  </button>
                )
              })}
            </div>
          </fieldset>
          <div className="lp-two">
            <fieldset>
              <legend>Effect</legend>
              <div className="lp-pills">
                {CREST_EFFECTS.map((effect) => (
                  <button key={effect} type="button" aria-pressed={crest?.effect === effect} onClick={() => setCrest({ effect })}>
                    {EFFECT_LABEL[effect]}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Scenery</legend>
              <div className="lp-pills">
                {BACKDROPS.map((backdrop) => (
                  <button key={backdrop} type="button" aria-pressed={crest?.backdrop === backdrop} onClick={() => setCrest({ backdrop })}>
                    {BACKDROP_LABEL[backdrop]}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </>
      ) : (
        EMOJI_GROUPS.map((group) => (
          <fieldset key={group.label}>
            <legend>{group.label}</legend>
            <div className="fw-emoji-grid">
              {group.emojis.map((e) => (
                <button key={e} type="button" onClick={() => onChange({ ...look, emoji: e })} aria-pressed={look.emoji === e} aria-label={`Use ${e} as the league icon`}>
                  <span aria-hidden>{e}</span>
                </button>
              ))}
            </div>
          </fieldset>
        ))
      )}

      <fieldset>
        <legend>Colour</legend>
        <div className="fw-swatches">
          {ACCENT_KEYS.map((key: AccentKey) => (
            <button key={key} type="button" onClick={() => onChange({ ...look, accent: key })} aria-pressed={look.accent === key} aria-label={ACCENTS[key].label} title={ACCENTS[key].label} className={ACCENTS[key].swatch} />
          ))}
        </div>
      </fieldset>
    </div>
  )
}
