import { notFound } from 'next/navigation'
import { AppNav } from '@web/components/app-nav'
import { MarketBoard } from '@web/components/sports/market-board'

/** The sports market page on sample games (the "sample" path segment switches the data to fixtures). Disabled on production builds. */
export default function SportsMarketPreview() {
  if (process.env.VERCEL_ENV === 'production' || (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production')) notFound()
  return <div className="peerfolio-app min-h-screen">
    <AppNav />
    <main className="peerfolio-main">
      <p className="mb-1 text-[10px] leading-3 text-muted-foreground">Design preview · sample games</p>
      <MarketBoard />
    </main>
  </div>
}
