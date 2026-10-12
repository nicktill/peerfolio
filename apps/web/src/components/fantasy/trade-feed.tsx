"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDownRight, ArrowUpRight, ChevronDown } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { formatCurrency, formatRelativeTime } from "@web/lib/format"
import { groupFeed, tradeCount, type FeedEntry } from "@web/lib/feed-groups"
import { cn } from "@web/lib/utils"

export type FeedItem = { id: string; name: string | null; handle: string | null; image: string | null; side: "buy" | "sell"; ticker: string; shares: number; price: number; at: string }

/** Lines shown before the rest fold away. A burst of trades by one person is a single line. */
const PREVIEW = 5

const firstName = (item: FeedItem) => item.name?.split(" ")[0] ?? item.handle
const SideIcon = ({ side }: { side: "buy" | "sell" }) => (
  <span className={`fw-side ${side === "buy" ? "fw-t-buy" : "fw-t-sell"}`} aria-hidden>
    {side === "buy" ? <ArrowUpRight /> : <ArrowDownRight />}
  </span>
)

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
    <section className="fw-panel" aria-labelledby="fw-feed-title">
      <div className="fw-section-head">
        <h2 id="fw-feed-title">Trade feed</h2>
        <span className="fw-live" aria-hidden />
      </div>
      {items.length === 0 ? (
        <p className="fw-empty">Quiet in here. Someone make the first move.</p>
      ) : (
        <>
          <ol className="fw-feed">
            {shown.map((entry) =>
              entry.kind === "single" ? (
                <li key={entry.item.id} className={cn(isNew(entry.item.id) && "animate-rise-in")}>
                  <div className="fw-feed-row">
                    <Avatar src={entry.item.image} name={entry.item.name} handle={entry.item.handle} size="sm" />
                    <p>
                      <span className="font-medium">{firstName(entry.item)}</span>{" "}
                      <span className={entry.item.side === "buy" ? "fw-t-buy" : "fw-t-sell"}>{entry.item.side === "buy" ? "bought" : "sold"}</span>{" "}
                      <span className="font-mono font-semibold">{entry.item.ticker}</span>{" "}
                      <span className="fw-t">
                        · {formatCurrency(entry.item.shares * entry.item.price)} · {formatRelativeTime(entry.item.at)}
                      </span>
                    </p>
                    <SideIcon side={entry.item.side} />
                  </div>
                </li>
              ) : (
                <GroupLine key={entry.key} entry={entry} open={open.has(entry.key)} onToggle={() => toggle(entry.key)} fresh={isNew(entry.items[0]!.id)} />
              ),
            )}
          </ol>
          {entries.length > PREVIEW ? (
            <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="fw-more" style={{ borderTop: 0 }}>
              {showAll ? "Show less" : `Show ${hiddenTrades} more ${hiddenTrades === 1 ? "trade" : "trades"}`}
              <ChevronDown aria-hidden />
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}

/** "Josh made 4 buys": one line that opens into the trades behind it. */
function GroupLine({ entry, open, onToggle, fresh }: { entry: Extract<FeedEntry<FeedItem>, { kind: "group" }>; open: boolean; onToggle: () => void; fresh: boolean }) {
  const first = entry.items[0]!
  const noun = entry.side === "buy" ? "buys" : "sells"
  return (
    <li className={cn(fresh && "animate-rise-in")}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="fw-feed-row">
        <Avatar src={first.image} name={first.name} handle={first.handle} size="sm" />
        <p>
          <span className="font-medium">{firstName(first)}</span> <span className={entry.side === "buy" ? "fw-t-buy" : "fw-t-sell"}>made {entry.items.length} {noun}</span>{" "}
          <span className="fw-t">
            · {formatCurrency(entry.total)} · {formatRelativeTime(entry.at)}
          </span>
        </p>
        <SideIcon side={entry.side} />
        <ChevronDown aria-hidden />
      </button>
      {open ? (
        <ul className="fw-feed-sub animate-rise-in">
          {entry.items.map((item) => (
            <li key={item.id}>
              <span>
                <b>{item.ticker}</b> · {formatCurrency(item.shares * item.price)}
              </span>
              <span>{formatRelativeTime(item.at)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}
