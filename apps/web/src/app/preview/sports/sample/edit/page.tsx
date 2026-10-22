import { notFound } from 'next/navigation'
import { AppNav } from '@web/components/app-nav'
import { EditLeaguePreviewClient } from './preview-client'

/** The owner's Edit league dialog on a fake league, so it can be looked at without being the owner of a real one. Disabled on production builds. */
export default function EditLeaguePreview() {
  if (process.env.VERCEL_ENV === 'production' || (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production')) notFound()
  const league = { id: 'sample', name: 'Demo Sharps', emoji: 'crest:hex:trophy:shimmer:stars', accent: 'sky', sports: ['nfl', 'nba'], endsAt: new Date(Date.now() + 20 * 86_400_000).toISOString(), startingCredits: 1000, maxStakePct: 10, maxParlayStakePct: null, liveBetting: true }
  return <div className="peerfolio-app min-h-screen">
    <AppNav />
    <main className="peerfolio-main">
      <p className="mb-3 text-[10px] leading-3 text-muted-foreground">Design preview · owner dialog on a sample league (saving is refused for the sample league)</p>
      <EditLeaguePreviewClient league={league} />
    </main>
  </div>
}
