"use client"

import { Dices } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { ACCENTS, ACCENT_KEYS, EMOJI_GROUPS, accentFor, randomLook, type AccentKey } from "@web/lib/league-look"
import { cn } from "@web/lib/utils"

export type Look = { emoji: string; accent: string }

/**
 * Pick a league's logo and colour, with a preview of the card it will become.
 * Used when creating a league and when the owner edits it, so the two match.
 */
export function LookPicker({ look, name, onChange }: { look: Look; name: string; onChange: (look: Look) => void }) {
  const accent = accentFor(look.accent)

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-card p-3">
        <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent", accent.gradient)} aria-hidden />
        {/* Re-keyed on every change, so the logo pops each time you pick a new one. */}
        <span key={look.emoji} className="emoji-pop relative grid size-14 shrink-0 place-items-center rounded-2xl border bg-background/80 text-3xl shadow-sm" aria-hidden>
          {look.emoji}
        </span>
        <div className="relative min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold tracking-tight">{name.trim() || "Your league"}</p>
          <p className="text-xs text-muted-foreground">How it looks in your leagues</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="relative shrink-0" onClick={() => onChange(randomLook())}>
          <Dices aria-hidden />
          Surprise me
        </Button>
      </div>

      <div className="space-y-3">
        {EMOJI_GROUPS.map((group) => (
          <fieldset key={group.label}>
            <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{group.label}</legend>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
              {group.emojis.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onChange({ ...look, emoji: e })}
                  aria-pressed={look.emoji === e}
                  aria-label={`Use ${e} as the league icon`}
                  className={cn(
                    "press grid aspect-square place-items-center rounded-xl border text-xl transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:bg-secondary",
                    look.emoji === e ? "border-primary bg-primary/10 ring-2 ring-primary/40" : "bg-background",
                  )}
                >
                  <span aria-hidden>{e}</span>
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Colour</legend>
        <div className="flex gap-2">
          {ACCENT_KEYS.map((key: AccentKey) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ ...look, accent: key })}
              aria-pressed={look.accent === key}
              aria-label={ACCENTS[key].label}
              title={ACCENTS[key].label}
              className={cn(
                "press size-8 rounded-full border-2 border-background shadow-sm transition-transform hover:scale-110",
                ACCENTS[key].swatch,
                look.accent === key && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
              )}
            />
          ))}
        </div>
      </fieldset>
    </div>
  )
}
