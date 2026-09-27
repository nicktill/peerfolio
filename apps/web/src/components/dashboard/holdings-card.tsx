"use client"

import { TickerLogo } from "@web/components/ui/ticker-logo"
import { PieChart } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { Delta } from "@web/components/ui/delta"
import { EmptyState } from "@web/components/ui/empty-state"
import { formatCurrency } from "@web/lib/format"

export type HoldingRow = {
  securityId: string
  ticker: string | null
  name: string | null
  type: string | null
  value: number
  quantity: number
  gainPercent: number | null
}

export function HoldingsCard({ holdings, hidden }: { holdings: HoldingRow[]; hidden: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top holdings</CardTitle>
      </CardHeader>
      <CardContent>
        {holdings.length === 0 ? (
          <EmptyState
            icon={PieChart}
            title="No holdings yet"
            description="Add positions to an account and they’ll show up here."
          />
        ) : (
          <ul className="divide-y">
            {holdings.map((holding) => (
              <li key={holding.securityId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <TickerLogo symbol={holding.ticker ?? "?"} kind={holding.type === "cryptocurrency" ? "crypto" : "stock"} size="sm" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{holding.ticker ?? holding.name ?? "Position"}</p>
                  <p className="truncate text-xs text-muted-foreground">{holding.name ?? ""}</p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="numeric text-sm font-semibold">
                    {formatCurrency(holding.value, { hidden, compact: true })}
                  </p>
                  {/* Only rendered when the institution reports a cost basis. */}
                  {holding.gainPercent != null ? (
                    <Delta value={holding.gainPercent} size="sm" variant="plain" digits={1} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
