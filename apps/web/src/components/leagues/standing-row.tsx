"use client"

import { useState } from "react"
import { EyeOff } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { Delta } from "@web/components/ui/delta"
import { Sparkline } from "@web/components/ui/sparkline"
import { cn } from "@web/lib/utils"

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
}: {
  standing: Standing
  onReact?: (toUserId: string, emoji: string) => void
  /** Off for fantasy leagues, where everyone trades the same play money. */
  showSource?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <li className={cn("py-3 first:pt-0 last:pb-0", standing.isYou && "-mx-2 rounded-lg bg-accent/40 px-2")}>
      <div className="flex items-center gap-3">
        <span
          className="numeric w-6 shrink-0 text-center text-sm font-bold"
          style={standing.rank <= 3 ? { color: MEDALS[standing.rank - 1] } : undefined}
        >
          {standing.rank}
        </span>

        <Avatar src={standing.image} name={standing.name} handle={standing.handle} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {standing.isYou ? "You" : (standing.name ?? standing.handle ?? "Member")}
          </p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {standing.handle ? `@${standing.handle}` : `${standing.days} days`}
            {showSource && !standing.isVerified ? (
              <span className="rounded bg-secondary px-1 py-px text-[10px] font-medium">self-reported</span>
            ) : null}
          </p>
        </div>

        <Sparkline points={standing.spark} className="hidden shrink-0 sm:block" />

        <div className="shrink-0 text-right">
          <Delta value={standing.percent} size="md" variant="plain" />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-9">
        {standing.shareHoldings && standing.holdings.length > 0 ? (
          standing.holdings.slice(0, 4).map((h) => (
            <span
              key={h.ticker}
              className="numeric rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium"
              title={`${h.name ?? h.ticker} — ${h.weight.toFixed(1)}% of their portfolio`}
            >
              {h.ticker} <span className="text-muted-foreground">{h.weight.toFixed(0)}%</span>
            </span>
          ))
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
    </li>
  )
}
