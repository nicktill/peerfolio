import { notFound } from 'next/navigation'
import { AppNav } from '@web/components/app-nav'
import { MarketBoardPreview } from '@web/components/sports/market-board'

/** Design preview of a browsable sports market page, on sample games. Disabled on production builds. */
export default function SportsMarketPreview() {
  if (process.env.VERCEL_ENV === 'production' || (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production')) notFound()
  return <div className="peerfolio-app min-h-screen">
    <AppNav />
    <main className="peerfolio-main">
      <p className="mb-1 text-[10px] leading-3 text-muted-foreground">Design preview · sample games, three card layouts</p>
      <MarketBoardPreview />
    </main>
  </div>
}
