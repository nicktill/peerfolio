"use client"

import { useMemo } from "react"
import { PortfolioScreen, type FantasyRow, type PortfolioSource } from "@web/components/dashboard/portfolio-screen"
import { DEMO_FANTASY, demoPortfolio } from "@web/lib/portfolio-demo"

const useDemoSource: PortfolioSource = (range) => {
  const data = useMemo(() => demoPortfolio(range), [range])
  return { data, loading: false, error: null, refetch: () => {} }
}

const useDemoFantasy = (): FantasyRow[] => DEMO_FANTASY

/** The real Portfolio screen running on an invented portfolio, for the preview route. */
export function DemoPortfolio() {
  return <PortfolioScreen useSource={useDemoSource} useFantasy={useDemoFantasy} demo />
}
