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
    <div className={cn("rounded-xl border bg-card p-5", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "numeric mt-2 font-semibold tracking-tight",
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
