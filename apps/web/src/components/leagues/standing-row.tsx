"use client"

import { useState } from "react"
import { EyeOff } from "lucide-react"
import { motion } from "motion/react"
import { Avatar } from "@web/components/ui/avatar"
import { Delta } from "@web/components/ui/delta"
import { Sparkline } from "@web/components/ui/sparkline"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import { cn } from "@web/lib/utils"
import { plural } from "@web/lib/plural"
import { withShownWeights } from "@web/lib/percent-display"

const REACTIONS = ["🔥", "🚀", "👏", "🧊", "🤝", "😤"] as const

export type Standing = {
  userId: string
  name: string | null
  handle: string | null
  image: string | null
  rank: number
  percent: number
  days: number
  spark: number[]
  hasHistory: boolean
  shareHoldings: boolean
  isVerified: boolean
  holdings: { ticker: string; name: string | null; weight: number }[]
  reactions: Record<string, number>
  isYou: boolean
}

const MEDALS = ["var(--rank-1)", "var(--rank-2)", "var(--rank-3)"]

/**
 * One member's line in a league table. Without `onReact` it renders read-only,
 * which is how the landing page shows it.
 */
export function StandingRow({
  standing,
  onReact,
  showSource = true,
  tone = "landing",
  index = 0,
}: {
  standing: Standing
  onReact?: (toUserId: string, emoji: string) => void
  /** Off for fantasy leagues, where everyone trades the same play money. */
  showSource?: boolean
  /** "app" marks you in ink, not green, so your row never looks like a win when you're last. */
  tone?: "landing" | "app"
  /** Position in the list, so rows arrive one after another. */
  index?: number
}) {
  const [open, setOpen] = useState(false)

  return (
    // Rows glide to their new rank when the ranking changes (a new window, a reaction, a refresh).
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -6% 0px" }}
      transition={{ layout: { type: "spring", stiffness: 420, damping: 38 }, default: { type: "spring", stiffness: 380, damping: 34, delay: Math.min(index, 5) * 0.05 } }}
      className={cn(
        "py-3",
        standing.isYou && (tone === "app" ? "surface-you -mx-2 rounded-xl px-3" : "-mx-2 rounded-lg bg-accent/40 px-2"),
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className="numeric w-6 shrink-0 text-center text-sm font-bold"
          style={
            standing.rank <= 3 ? { color: tone === "app" && standing.rank === 1 ? "var(--gold-ink)" : MEDALS[standing.rank - 1] } : undefined
          }
        >
          {standing.rank}
        </span>

        <Avatar src={standing.image} name={standing.name} handle={standing.handle} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {standing.isYou ? "You" : (standing.name ?? standing.handle ?? "Member")}
            {standing.isYou && tone === "app" ? (
              <span className="ml-1.5 rounded bg-foreground px-1 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-background">
                you
              </span>
            ) : null}
          </p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {standing.handle ? `@${standing.handle}` : plural(standing.days, "day")}
            {showSource && !standing.isVerified ? (
              <span className="rounded bg-secondary px-1 py-px text-[10px] font-medium">self-reported</span>
            ) : null}
          </p>
        </div>

        <Sparkline points={standing.spark} className="hidden shrink-0 sm:block" />

        <div className="w-24 shrink-0 text-right">
          <Delta value={standing.percent} size="md" variant="plain" />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[84px]">
        {standing.shareHoldings && standing.holdings.length > 0 ? (
          withShownWeights(standing.holdings.slice(0, 4)).map((h) => <HoldingChip key={h.ticker} holding={h} />)
        ) : standing.shareHoldings ? (
          // Sharing is on but there's nothing to show yet (a new member who hasn't bought anything). Not the same as private.
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">Nothing held yet</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <EyeOff className="h-3 w-3" aria-hidden />
            Holdings private
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {Object.entries(standing.reactions).map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => !standing.isYou && onReact?.(standing.userId, emoji)}
              disabled={standing.isYou || !onReact}
              className="numeric inline-flex items-center gap-0.5 rounded-full bg-secondary px-1.5 py-0.5 text-[11px] transition-transform enabled:hover:scale-105"
            >
              <span aria-hidden>{emoji}</span>
              {count}
            </button>
          ))}

          {!standing.isYou && onReact ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpen(!open)}
                className="rounded-full border px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                aria-expanded={open}
              >
                +
              </button>
              {open ? (
                <div className="absolute bottom-full right-0 z-10 mb-1 flex gap-0.5 rounded-lg border bg-popover p-1 shadow-md">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReact(standing.userId, emoji)
                        setOpen(false)
                      }}
                      className="rounded px-1.5 py-1 text-base transition-transform hover:scale-110"
                    >
                      <span aria-hidden>{emoji}</span>
                      <span className="sr-only">React with {emoji}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </motion.li>
  )
}

/**
 * One of someone's top picks: its logo, ticker and share of their portfolio, with
 * a soft fill behind it as wide as that share, so a 50% pick looks half full.
 */
function HoldingChip({ holding }: { holding: { ticker: string; name: string | null; weight: number; shownWeight: string } }) {
  const fill = Math.min(100, Math.max(0, holding.weight))
  return (
    <span
      className="numeric press inline-flex items-center gap-1.5 rounded-full border bg-secondary/60 py-0.5 pl-0.5 pr-2.5 text-[11px] font-medium transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-sm"
      style={{ backgroundImage: `linear-gradient(90deg, hsl(var(--primary) / 0.16) ${fill}%, transparent ${fill}%)` }}
      title={`${holding.name ?? holding.ticker}: ${holding.weight.toFixed(1)}% of their portfolio`}
    >
      <TickerLogo symbol={holding.ticker} size="xs" className="rounded-full border-0 shadow-none" />
      <span className="font-mono font-semibold">{holding.ticker}</span>
      <span className="text-muted-foreground">{holding.shownWeight}%</span>
    </span>
  )
}
