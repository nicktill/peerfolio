import type { ReactNode } from "react"

/** The money row shared by pick and parlay tickets: three labelled figures that keep their width as numbers change. */
export function TicketMoney({ children, label = "Pick money" }: { children: ReactNode; label?: string }) {
  return <dl className="sl-tk-money numeric" aria-label={label}>{children}</dl>
}

/** One labelled figure. `tone` colours it gain/loss; `big` is the settled net result. */
export function TicketFig({ label, tone, big, title, children }: { label: string; tone?: "up" | "down" | "muted"; big?: boolean; title?: string; children: ReactNode }) {
  return (
    <div className="sl-tk-fig" data-tone={tone} data-big={big || undefined} title={title}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
