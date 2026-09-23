import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { cn } from "@web/lib/utils"
import { formatPercent } from "@web/lib/format"

type Size = "sm" | "md" | "lg"

const SIZES: Record<Size, { text: string; icon: string; pad: string }> = {
  sm: { text: "text-xs", icon: "h-3 w-3", pad: "px-1.5 py-0.5 gap-0.5" },
  md: { text: "text-sm", icon: "h-3.5 w-3.5", pad: "px-2 py-1 gap-1" },
  lg: { text: "text-base", icon: "h-4 w-4", pad: "px-2.5 py-1 gap-1" },
}

/**
 * A signed percentage change.
 *
 * Direction is carried three ways — arrow, sign and colour — because the
 * gain/loss hues sit in the colourblind warn band and must never be the only
 * cue. Do not strip the icon to "clean it up".
 */
export function Delta({
  value,
  size = "md",
  variant = "chip",
  digits = 2,
  className,
}: {
  value: number
  size?: Size
  variant?: "chip" | "plain"
  digits?: number
  className?: string
}) {
  const s = SIZES[size]
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat"
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus

  const tone =
    direction === "up"
      ? "text-[--gain] bg-[--gain]/10"
      : direction === "down"
        ? "text-[--loss] bg-[--loss]/10"
        : "text-muted-foreground bg-muted"

  return (
    <span
      className={cn(
        "numeric inline-flex items-center font-semibold tabular-nums",
        s.text,
        variant === "chip" ? cn("rounded-full", s.pad, tone) : tone.split(" ")[0],
        variant === "plain" && "gap-1",
        className,
      )}
    >
      <Icon className={cn(s.icon, "shrink-0")} aria-hidden />
      {formatPercent(value, digits)}
    </span>
  )
}
