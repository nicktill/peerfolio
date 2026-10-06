"use client"

import { PortfolioScreen, type PortfolioResponse, type PortfolioSource } from "@web/components/dashboard/portfolio-screen"
import { liveRefreshMs } from "@web/lib/live-refresh"
import { useApi } from "@web/lib/use-api"

const usePortfolioApi: PortfolioSource = (range) =>
  useApi<PortfolioResponse>(`/api/portfolio?range=${range}`, [range], { refreshMs: liveRefreshMs(300_000) })

export default function DashboardPage() {
  return <PortfolioScreen useSource={usePortfolioApi} />
}
