"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cn } from "@web/lib/utils"

/**
 * shadcn/ui Slider (Radix): real keyboard, touch and screen-reader behaviour.
 * Peerfolio styling: a gradient fill, a lifted thumb that swells when held, and a
 * `bubble` that floats above it while it's held or focused.
 */
export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    /** Text shown above the thumb while it's held or focused. */
    bubble?: React.ReactNode
    /** Fractions (0-1) drawn as ticks on the track. */
    ticks?: readonly number[]
    activeTick?: number
    /** The thumb's accessible value text. */
    thumbLabel?: string
  }
>(({ className, bubble, ticks, activeTick, thumbLabel, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("group/slider relative flex h-7 w-full touch-none select-none items-center data-[disabled]:opacity-40", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow rounded-full bg-secondary shadow-[inset_0_1px_2px_hsl(var(--foreground)/0.12)]">
      <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-[hsl(var(--primary)/0.75)] to-primary shadow-[0_0_12px_-2px_hsl(var(--primary)/0.55)]" />
      {ticks?.map((tick) => (
        <span
          key={tick}
          aria-hidden
          className={cn(
            "absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/25 transition-all duration-150",
            activeTick === tick && "size-1.5 bg-primary-foreground/90",
          )}
          style={{ left: `${tick * 100}%` }}
        />
      ))}
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label={props["aria-label"]}
      aria-valuetext={thumbLabel}
      className={cn(
        "group/thumb relative block size-[22px] rounded-full border-[3px] border-primary bg-background outline-none",
        "shadow-[0_1px_2px_hsl(var(--foreground)/0.25),0_6px_14px_-4px_hsl(var(--primary)/0.55)]",
        "transition-[transform,box-shadow] duration-150 ease-out hover:scale-110 active:scale-125",
        "focus-visible:ring-4 focus-visible:ring-primary/25",
      )}
    >
      {bubble ? (
        <span
          aria-hidden
          className={cn(
            "numeric pointer-events-none absolute bottom-full left-1/2 mb-2.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-lg",
            "transition-[opacity,transform] duration-150 ease-out",
            "group-active/thumb:translate-y-0 group-active/thumb:opacity-100 group-focus-visible/thumb:translate-y-0 group-focus-visible/thumb:opacity-100",
          )}
        >
          {bubble}
          <span className="absolute left-1/2 top-full size-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-foreground" />
        </span>
      ) : null}
    </SliderPrimitive.Thumb>
  </SliderPrimitive.Root>
))
Slider.displayName = "Slider"
