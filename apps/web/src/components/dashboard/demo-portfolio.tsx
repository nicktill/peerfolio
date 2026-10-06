"use client"

import { useMemo } from "react"
import { PortfolioScreen, type PortfolioSource } from "@web/components/dashboard/portfolio-screen"
import { demoPortfolio } from "@web/lib/portfolio-demo"

const useDemoSource: PortfolioSource = (range) => {
  const data = useMemo(() => demoPortfolio(range), [range])
  return { data, loading: false, error: null, refetch: () => {} }
}

/** The real Portfolio screen running on an invented portfolio, for the preview route. */
export function DemoPortfolio() {
  return <PortfolioScreen useSource={useDemoSource} demo />
}
