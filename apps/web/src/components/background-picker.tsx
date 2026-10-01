"use client"

import { BACKGROUNDS, useBackground } from "@web/lib/background-pref"
import { cn } from "@web/lib/utils"

/** Settings card: choose the app background and whether it reacts to the cursor. */
export function BackgroundPicker() {
  const [pref, setPref] = useBackground()
  if (!pref) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {BACKGROUNDS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setPref({ ...pref, id: b.id })}
            aria-pressed={pref.id === b.id}
            className={cn(
              "press rounded-xl border p-3 text-left transition-colors hover:border-primary/40",
              pref.id === b.id ? "border-primary bg-accent/50 ring-1 ring-primary/30" : "bg-card",
            )}
          >
            <span className="block text-sm font-medium">{b.label}</span>
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{b.note}</span>
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-4 rounded-xl border p-3">
        <span>
          <span className="block text-sm font-medium">Interactive</span>
          <span className="block text-xs text-muted-foreground">Let the background react to your cursor. It keeps its gentle motion either way.</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={pref.interactive}
          onClick={() => setPref({ ...pref, interactive: !pref.interactive })}
          disabled={pref.id === "classic"}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40",
            pref.interactive ? "bg-primary" : "bg-secondary",
          )}
        >
          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]", pref.interactive ? "left-[22px]" : "left-0.5")} />
        </button>
      </label>
    </div>
  )
}
