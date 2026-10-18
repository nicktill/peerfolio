import { notFound } from 'next/navigation'
import { AppNav } from '@web/components/app-nav'
import { HeroPreview } from './hero-preview'
import SportsLeaguePage from '@web/app/(app)/fantasy/sports/[id]/page'

/** Uses the existing browser-only sample league; disabled on production builds. */
export default function SportsPreview() {
  if (process.env.VERCEL_ENV === 'production' || (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production')) notFound()
  return <div className="peerfolio-app min-h-screen">
    <AppNav />
    <main className="peerfolio-main">
      <p className="mb-1 text-[10px] leading-3 text-muted-foreground">Design preview · sample games and play cash</p>
      <HeroPreview/>
      <SportsLeaguePage params={Promise.resolve({id:'sample'})}/>
    </main>
  </div>
}
