import { Avatar } from "@web/components/ui/avatar"
import { formatCurrency, formatRelativeTime } from "@web/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"

export type FeedItem = { id: string; name: string | null; handle: string | null; image: string | null; side: "buy" | "sell"; ticker: string; shares: number; price: number; at: string }

/** The league's trades, newest first. The pump.fun-style pulse of a league. */
export function TradeFeed({ items }: { items: FeedItem[] }) {
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
          <ol className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-2.5 text-sm">
                <Avatar src={item.image} name={item.name} handle={item.handle} size="sm" />
                <p className="min-w-0 flex-1 leading-snug">
                  <span className="font-medium">{item.name?.split(" ")[0] ?? item.handle}</span>{" "}
                  <span style={{ color: item.side === "buy" ? "var(--gain)" : "var(--loss)" }}>
                    {item.side === "buy" ? "bought" : "sold"}
                  </span>{" "}
                  <span className="font-mono font-semibold">{item.ticker}</span>{" "}
                  <span className="numeric text-muted-foreground">
                    · {formatCurrency(item.shares * item.price)} · {formatRelativeTime(item.at)}
                  </span>
                </p>
                <span aria-hidden>{item.side === "buy" ? "🚀" : "💸"}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
