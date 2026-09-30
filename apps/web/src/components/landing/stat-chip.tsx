import { revealStyle } from "@web/components/motion/reveal"
import { cn } from "@web/lib/utils"

/**
 * A small floating stat beside the hero, tilted like a card someone dropped on
 * the desk. Same two-layer structure as ChatBubble: the outer element owns
 * position, tilt and entrance; the inner one owns the endless float.
 */
export function StatChip({ label, value, note, tone = "gain", className, delay = 0 }: {
  label: string
  value: string
  note: string
  tone?: "gain" | "loss"
  className?: string
  delay?: number
}) {
  return (
    <div aria-hidden className={cn("reveal absolute z-10 hidden xl:block", className)} style={revealStyle(7 + Math.round(delay))}>
      <div className="float-y w-44 rounded-2xl border bg-card/90 px-4 py-3 shadow-lg backdrop-blur" style={{ animationDelay: `${delay}s` }}>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <p className={cn("numeric mt-1.5 text-2xl font-semibold tracking-tight", tone === "gain" ? "text-gain-ink" : "text-loss-ink")}>{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
      </div>
    </div>
  )
}
