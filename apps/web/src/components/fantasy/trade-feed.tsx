"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { formatCurrency, formatRelativeTime } from "@web/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { groupFeed, tradeCount, type FeedEntry } from "@web/lib/feed-groups"
import { cn } from "@web/lib/utils"

export type FeedItem = { id: string; name: string | null; handle: string | null; image: string | null; side: "buy" | "sell"; ticker: string; shares: number; price: number; at: string }

/** Lines shown before the rest fold away. A burst of trades by one person is a single line. */
const PREVIEW = 5

const firstName = (item: FeedItem) => item.name?.split(" ")[0] ?? item.handle
const sideColor = (side: "buy" | "sell") => ({ color: side === "buy" ? "var(--gain-ink)" : "var(--loss-ink)" })
const emojiFor = (side: "buy" | "sell") => (side === "buy" ? "🚀" : "💸")

/** The league's trades, newest first. The pump.fun-style pulse of a league. */
export function TradeFeed({ items }: { items: FeedItem[] }) {
  const entries = useMemo(() => groupFeed(items), [items])
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())

  // Trades that turn up after the first paint slide in; the ones already there don't replay.
  const seen = useRef<Set<string> | null>(null)
  const isNew = (id: string) => seen.current !== null && !seen.current.has(id)
  useEffect(() => {
    seen.current = new Set(items.map((i) => i.id))
  }, [items])

  const shown = showAll ? entries : entries.slice(0, PREVIEW)
  const hiddenTrades = tradeCount(entries) - tradeCount(shown)

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Trade feed</CardTitle>
        <span className="relative flex size-2" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--gain)] opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-2 rounded-full bg-[var(--gain)]" />
        </span>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Quiet in here. Someone make the first move.</p>
        ) : (
          <>
            <ol className="space-y-3">
              {shown.map((entry) =>
                entry.kind === "single" ? (
                  <li key={entry.item.id} className={cn("flex items-start gap-2.5 text-sm", isNew(entry.item.id) && "animate-rise-in")}>
                    <Avatar src={entry.item.image} name={entry.item.name} handle={entry.item.handle} size="sm" />
                    <p className="min-w-0 flex-1 leading-snug">
                      <span className="font-medium">{firstName(entry.item)}</span>{" "}
                      <span style={sideColor(entry.item.side)}>{entry.item.side === "buy" ? "bought" : "sold"}</span>{" "}
                      <span className="font-mono font-semibold">{entry.item.ticker}</span>{" "}
                      <span className="numeric text-muted-foreground">
                        · {formatCurrency(entry.item.shares * entry.item.price)} · {formatRelativeTime(entry.item.at)}
                      </span>
                    </p>
                    <span aria-hidden>{emojiFor(entry.item.side)}</span>
                  </li>
                ) : (
                  <GroupLine key={entry.key} entry={entry} open={open.has(entry.key)} onToggle={() => toggle(entry.key)} fresh={isNew(entry.items[0]!.id)} />
                ),
              )}
            </ol>
            {entries.length > PREVIEW ? (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="press mt-3 inline-flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {showAll ? "Show less" : `Show ${hiddenTrades} more ${hiddenTrades === 1 ? "trade" : "trades"}`}
                <ChevronDown className={cn("size-3.5 transition-transform", showAll && "rotate-180")} aria-hidden />
              </button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** "Josh made 4 buys": one line that opens into the trades behind it. */
function GroupLine({ entry, open, onToggle, fresh }: { entry: Extract<FeedEntry<FeedItem>, { kind: "group" }>; open: boolean; onToggle: () => void; fresh: boolean }) {
  const first = entry.items[0]!
  const noun = entry.side === "buy" ? "buys" : "sells"
  return (
    <li className={cn("text-sm", fresh && "animate-rise-in")}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-2.5 rounded-lg text-left transition-colors hover:bg-secondary/60">
        <Avatar src={first.image} name={first.name} handle={first.handle} size="sm" />
        <p className="min-w-0 flex-1 leading-snug">
          <span className="font-medium">{firstName(first)}</span> <span style={sideColor(entry.side)}>made {entry.items.length} {noun}</span>{" "}
          <span className="numeric text-muted-foreground">
            · {formatCurrency(entry.total)} · {formatRelativeTime(entry.at)}
          </span>
        </p>
        <span aria-hidden>{emojiFor(entry.side)}</span>
        <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <ul className="animate-rise-in mt-1.5 space-y-1 border-l pl-3 ml-3.5">
          {entry.items.map((item) => (
            <li key={item.id} className="numeric flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                <span className="font-mono font-semibold text-foreground">{item.ticker}</span> · {formatCurrency(item.shares * item.price)}
              </span>
              <span>{formatRelativeTime(item.at)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}
