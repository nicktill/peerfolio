import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Card } from "@web/components/ui/card"
import { revealStyle } from "@web/components/motion/reveal"
import { cn } from "@web/lib/utils"

/** The small uppercase label every News card (and section) opens with. */
export function SectionLabel({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <h2 id={id} className={cn("font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground", className)}>
      {children}
    </h2>
  )
}

/**
 * One card anatomy for the whole page: a labelled header row on a hairline,
 * an optional action on the right, then the body. Keeping every card the same
 * shape is what makes the page read as one thing instead of a pile of widgets.
 */
export function SectionCard({
  label,
  href,
  action,
  index = 0,
  className,
  children,
}: {
  label: React.ReactNode
  href?: string
  action?: React.ReactNode
  index?: number
  className?: string
  children: React.ReactNode
}) {
  const id = typeof label === "string" ? `news-${label.toLowerCase().replace(/[^a-z]+/g, "-")}` : undefined
  return (
    <Card className={cn("reveal flex flex-col overflow-hidden", className)} style={revealStyle(index)} aria-labelledby={id}>
      <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b py-2.5 pl-5 pr-3">
        {href ? (
          <Link href={href} className="group inline-flex items-center gap-1.5">
            <SectionLabel id={id} className="transition-colors group-hover:text-foreground">
              {label}
            </SectionLabel>
            <ChevronRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ) : (
          <SectionLabel id={id}>{label}</SectionLabel>
        )}
        {action}
      </div>
      {children}
    </Card>
  )
}
