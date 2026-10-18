import { NextResponse } from 'next/server'
import { withSportsUser } from '@web/lib/sports/api'
import { assertLiveTestAdmin } from '@web/lib/sports/live-test-auth'
import { LIVE_TEST } from '@web/lib/sports/live-test'

/** Hard admin gate, independent of the public sports feature flag. No upstream calls. */
export const GET = withSportsUser<unknown>(async (userId) => {
  await assertLiveTestAdmin(userId)
  return NextResponse.json({ enabled: !!process.env.NEXTAUTH_SECRET, mode: 'ADMIN_PAPER_TEST', ...LIVE_TEST }, { headers: { 'Cache-Control': 'private, no-store' } })
})
