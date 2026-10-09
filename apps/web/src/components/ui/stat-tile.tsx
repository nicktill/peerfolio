import { cn } from "@web/lib/utils"
import { Delta } from "@web/components/ui/delta"

/**
 * One headline number. A KPI row of these replaces what would otherwise be a
 * chart of four unrelated bars.
 */
export function StatTile({
  label,
  value,
  delta,
  hint,
  emphasis = false,
  className,
}: {
  label: string
  value: React.ReactNode
  delta?: number | null
  hint?: string
  emphasis?: boolean
  className?: string
}) {
  return (
    <div className={cn("group rounded-2xl border bg-card p-5 shadow-card transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-pop", className)}>
      <p className="text-[13px] font-medium tracking-[-0.005em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "numeric mt-2 font-display font-semibold tracking-[-0.03em]",
          emphasis ? "text-3xl sm:text-4xl" : "text-2xl",
        )}
      >
        {value}
      </p>
      <div className="mt-2 flex min-h-5 items-center gap-2">
        {typeof delta === "number" ? <Delta value={delta} size="sm" /> : null}
        {hint ? <span className="truncate text-xs text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  )
}
