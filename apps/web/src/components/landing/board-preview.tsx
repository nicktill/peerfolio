import { ShieldCheck } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { Badge } from "@web/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { Delta } from "@web/components/ui/delta"
import { Sparkline } from "@web/components/ui/sparkline"
import { DEMO_STANDINGS } from "@web/components/landing/demo"

const MEDALS = ["var(--rank-1)", "var(--rank-2)", "var(--rank-3)"]

/** The public board's layout, with the demo members standing in for real ones. */
export function BoardPreview() {
  const traders = DEMO_STANDINGS.filter((s) => !s.isYou).slice(0, 3)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Top traders</CardTitle>
        <Badge variant="verified">
          <ShieldCheck aria-hidden />
          Verified only
        </Badge>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {traders.map((trader, i) => (
            <li key={trader.userId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="numeric w-6 shrink-0 text-center text-sm font-bold" style={{ color: MEDALS[i] }}>
                {i + 1}
              </span>
              <Avatar name={trader.name} handle={trader.handle} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{trader.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  @{trader.handle} · {trader.days}d tracked
                </p>
              </div>
              <Sparkline points={trader.spark} className="hidden shrink-0 sm:block" />
              <Delta value={trader.percent} variant="plain" />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
