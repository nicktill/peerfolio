"use client"

import { useId, useState } from "react"
import { parseNumber } from "./format"

/**
 * A labelled number field with a native range slider underneath. The text box accepts any value
 * (the slider only covers the common range); the slider is a real <input type=range>, so arrow keys,
 * Home/End and PageUp/Down all work.
 */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  decimals = 0,
  tag,
  hint,
  inputId,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  prefix?: string
  suffix?: string
  decimals?: number
  /** e.g. "imported" */
  tag?: string
  hint?: string
  /** Overrides the generated id of the text input (so other controls can focus it). */
  inputId?: string
}) {
  const id = useId()
  const fieldId = inputId ?? `${id}-n`
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value.toLocaleString("en-US", { maximumFractionDigits: decimals, useGrouping: !suffix })
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={fieldId} className="pf-eyebrow flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {label}
          {tag ? <span className="wl-tag">{tag}</span> : null}
        </label>
        <div className="wl-input w-[8.5rem] shrink-0">
          {prefix ? <span aria-hidden>{prefix}</span> : null}
          <input
            id={fieldId}
            inputMode="decimal"
            autoComplete="off"
            value={shown}
            aria-describedby={hint ? `${id}-h` : undefined}
            onFocus={(e) => { setDraft(String(value)); e.currentTarget.select() }}
            onChange={(e) => {
              setDraft(e.target.value)
              const n = parseNumber(e.target.value)
              if (n != null) onChange(n)
            }}
            onBlur={() => setDraft(null)}
          />
          {suffix ? <span aria-hidden>{suffix}</span> : null}
        </div>
      </div>
      <input
        type="range"
        className="wl-range"
        aria-label={`${label} slider`}
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        style={{ "--p": `${pct}%` } as React.CSSProperties}
        onChange={(e) => { setDraft(null); onChange(Number(e.target.value)) }}
      />
      {hint ? <p id={`${id}-h`} className="mt-0.5 text-[12px] leading-4 text-[var(--fg3)]">{hint}</p> : null}
    </div>
  )
}

/** A compact standalone number input (used inside the question cards). */
export function MiniField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  decimals = 0,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  prefix?: string
  suffix?: string
  decimals?: number
}) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value.toLocaleString("en-US", { maximumFractionDigits: decimals, useGrouping: !suffix })
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-[13px] text-[var(--fg2)]">{label}</label>
      <div className="wl-input w-28">
        {prefix ? <span aria-hidden>{prefix}</span> : null}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={shown}
          onFocus={(e) => { setDraft(String(value)); e.currentTarget.select() }}
          onChange={(e) => {
            setDraft(e.target.value)
            const n = parseNumber(e.target.value)
            if (n != null) onChange(n)
          }}
          onBlur={() => setDraft(null)}
        />
        {suffix ? <span aria-hidden>{suffix}</span> : null}
      </div>
    </div>
  )
}
