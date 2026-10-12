"use client"

import { Dices } from "lucide-react"
import { ACCENTS, ACCENT_KEYS, EMOJI_GROUPS, randomLook, type AccentKey } from "@web/lib/league-look"

export type Look = { emoji: string; accent: string }

/**
 * Pick a league's logo and colour, with a preview of the card it will become.
 * Used when creating a league and when the owner edits it, so the two match.
 */
export function LookPicker({ look, name, onChange }: { look: Look; name: string; onChange: (look: Look) => void }) {
  return (
    <div className="fw-look">
      <div className="fw-look-preview">
        <div className="fw-art" data-accent={look.accent} aria-hidden>
          {/* Re-keyed on every change, so the logo pops each time you pick a new one. */}
          <span key={look.emoji} className="emoji-pop">{look.emoji}</span>
        </div>
        <div className="fw-look-name">
          <p>{name.trim() || "Your league"}</p>
          <span>How it looks in your leagues</span>
        </div>
        <button type="button" className="fw-btn" onClick={() => onChange(randomLook())}>
          <Dices aria-hidden />
          Surprise me
        </button>
      </div>

      {EMOJI_GROUPS.map((group) => (
        <fieldset key={group.label}>
          <legend>{group.label}</legend>
          <div className="fw-emoji-grid">
            {group.emojis.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onChange({ ...look, emoji: e })}
                aria-pressed={look.emoji === e}
                aria-label={`Use ${e} as the league icon`}
              >
                <span aria-hidden>{e}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      <fieldset>
        <legend>Colour</legend>
        <div className="fw-swatches">
          {ACCENT_KEYS.map((key: AccentKey) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ ...look, accent: key })}
              aria-pressed={look.accent === key}
              aria-label={ACCENTS[key].label}
              title={ACCENTS[key].label}
              className={ACCENTS[key].swatch}
            />
          ))}
        </div>
      </fieldset>
    </div>
  )
}
