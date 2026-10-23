"use client"

import { useRef } from "react"
import { cn } from "@web/lib/utils"
import { slideStyle, useSlidingIndicator } from "@web/lib/use-sliding-indicator"

/**
 * Compact single-choice control for time ranges. Rendered as a radiogroup so
 * arrow keys and screen readers behave, unlike a row of styled buttons.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "default",
  variant = "pill",
  className,
  label,
}: {
  options: readonly T[] | readonly { value: T; label: string; disabled?: boolean; title?: string }[]
  value: T
  onChange: (value: T) => void
  size?: "sm" | "default"
  /** "underline" drops the boxed pill for plain labels with a sliding accent line; compact enough to share a row with a label on phones. */
  variant?: "pill" | "underline"
  className?: string
  label: string
}) {
  const underline = variant === "underline"
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o, disabled: false, title: undefined } : { disabled: false, title: undefined, ...o }))
  const { containerRef, rect, ready } = useSlidingIndicator<HTMLDivElement>(value)
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({})

  // Radio-group keyboard model: one tab stop, arrows move and select.
  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
    if (!step) return
    e.preventDefault()
    const enabled = items.filter((i) => !i.disabled)
    const at = enabled.findIndex((i) => i.value === value)
    const next = enabled[(at + step + enabled.length) % enabled.length]!
    onChange(next.value)
    buttons.current[next.value]?.focus()
  }

  return (
    <div ref={containerRef} role="radiogroup" data-variant={variant} aria-label={label} onKeyDown={onKeyDown} className={cn(underline ? "relative inline-flex" : "relative inline-flex rounded-[9px] border border-border bg-background p-[3px]", className)}>
      {/* The selected pill (or underline) glides between options instead of jumping. */}
      {underline ? (
        <span aria-hidden className="absolute bottom-0 left-0 h-[2px] after:absolute after:inset-x-[22%] after:inset-y-0 after:rounded-full after:bg-[--pf-accent]" style={slideStyle(rect, ready)} />
      ) : (
        <span aria-hidden className="absolute inset-y-[3px] left-0 rounded-[6px] bg-secondary shadow-[inset_0_0_0_1px_hsl(var(--input))]" style={slideStyle(rect, ready)} />
      )}
      {items.map((item) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            data-slide-key={item.value}
            ref={(el) => {
              buttons.current[item.value] = el
            }}
            tabIndex={selected ? 0 : -1}
            type="button"
            role="radio"
            aria-checked={selected}
            // aria-disabled, not disabled: a disabled button shows no tooltip, and the
            // tooltip is the only place the reason lives.
            aria-disabled={item.disabled || undefined}
            title={item.title}
            onClick={() => {
              if (!item.disabled) onChange(item.value)
            }}
            className={cn(
              "press relative z-10 font-medium transition-colors",
              underline ? "h-10 px-2 font-mono text-[11px] tracking-[0.04em] sm:h-9 sm:px-3.5 sm:tracking-[0.06em]" : "rounded-[6px]",
              // Taller on touch screens, where 24px is too small a target.
              !underline && (size === "sm" ? "h-10 px-3 font-mono text-[11px] tracking-[0.06em] sm:h-6 sm:px-2.5" : "h-10 px-4 text-[13px] sm:h-7"),
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              item.disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
