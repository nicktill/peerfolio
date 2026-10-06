"use client"

import { NewsBoard, type HoldingMoves } from "@web/components/news/news-board"
import { useApi } from "@web/lib/use-api"
import type { PortfolioResponse } from "@web/components/dashboard/portfolio-screen"

export default function NewsPage() {
  // Your biggest movers today, from the same data the Portfolio page uses.
  const { data } = useApi<PortfolioResponse>("/api/portfolio?range=1W&stored=1")
  const moves: HoldingMoves = data
    ? data.holdings
        .filter((h) => h.ticker && h.todayPercent != null)
        .sort((a, b) => Math.abs(b.todayPercent!) - Math.abs(a.todayPercent!))
        .slice(0, 5)
        .map((h) => ({ symbol: h.ticker!, percent: h.todayPercent! }))
    : null
  const held = data ? [...new Set(data.holdings.flatMap((h) => (h.ticker ? [h.ticker] : [])))] : []
  return <NewsBoard holdingMoves={moves} held={held} />
}
