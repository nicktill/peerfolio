import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { MagicCard } from "@web/components/magicui/magic-card"
import { revealStyle } from "@web/components/motion/reveal"
import { cn } from "@web/lib/utils"

/** The small uppercase label every card (and section) opens with. */
export function SectionLabel({ children, className, id, as: Tag = "h2" }: { children: React.ReactNode; className?: string; id?: string; as?: "h1" | "h2" | "span" }) {
  return (
    <Tag id={id} className={cn("font-display text-[14px] font-semibold tracking-[-0.01em] text-foreground/80", className)}>
      {children}
    </Tag>
  )
}

/** Tinted backgrounds for the icon chip, from the categorical palette so cards are told apart at a glance. */
const TONES = {
  primary: "bg-primary/15 text-primary",
  blue: "bg-[color-mix(in_srgb,var(--series-1)_16%,transparent)] text-[--series-1]",
  orange: "bg-[color-mix(in_srgb,var(--series-2)_16%,transparent)] text-[--series-2]",
  amber: "bg-[color-mix(in_srgb,var(--series-4)_18%,transparent)] text-gold-ink",
  pink: "bg-[color-mix(in_srgb,var(--series-5)_16%,transparent)] text-[--series-5]",
  violet: "bg-[color-mix(in_srgb,var(--series-7)_16%,transparent)] text-[--series-7]",
} as const

export type ChipTone = keyof typeof TONES

/** A small rounded square holding an icon, tinted to tell sections apart (the Fantasy page's vocabulary). */
export function IconChip({ tone = "primary", children, className }: { tone?: ChipTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("grid size-6 shrink-0 place-items-center rounded-lg [&>svg]:size-3.5", TONES[tone], className)} aria-hidden>
      {children}
    </span>
  )
}

/**
 * One card anatomy for the whole page: a labelled header row on a hairline,
 * an optional action on the right, then the body. Keeping every card the same
 * shape is what makes the page read as one thing instead of a pile of widgets.
 */
export function SectionCard({
  label,
  labelId,
  href,
  action,
  icon,
  tone,
  index = 0,
  className,
  children,
}: {
  label: React.ReactNode
  /** A lucide icon shown in a tinted chip before the label. */
  icon?: React.ReactNode
  tone?: ChipTone
  /** Names the card for screen readers when `label` isn't plain text. */
  labelId?: string
  href?: string
  action?: React.ReactNode
  index?: number
  className?: string
  children: React.ReactNode
}) {
  const id = labelId ?? (typeof label === "string" ? `card-${label.toLowerCase().replace(/[^a-z]+/g, "-")}` : undefined)
  return (
    // Magic UI's Magic Card: a light follows the cursor across the card's border and surface.
    <MagicCard
      className={cn("reveal rounded-2xl bg-card text-card-foreground shadow-card", className)}
      contentClassName="flex flex-col"
      style={revealStyle(index)}
      aria-labelledby={id}
      {...CARD_GLOW}
    >
      <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b py-2.5 pl-5 pr-3">
        <span className="flex items-center gap-2.5">
          {icon ? <IconChip tone={tone}>{icon}</IconChip> : null}
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
        </span>
        {action}
      </div>
      {children}
    </MagicCard>
  )
}

/** The light a card throws under the cursor: brand green on the border, a faint wash on the surface. */
export const CARD_GLOW = {
  gradientSize: 260,
  gradientFrom: "hsl(var(--primary))",
  gradientTo: "hsl(var(--primary) / 0.3)",
  gradientColor: "hsl(var(--primary) / 0.07)",
  gradientOpacity: 1,
} as const
