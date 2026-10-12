import { NextResponse } from "next/server"
import { withPublic } from "@web/lib/api"
import { readCachedNews, refreshNewsIfDue } from "@web/lib/news"

export const dynamic = "force-dynamic"
// A visit may run the news job in the background (feeds plus up to two recaps).
export const maxDuration = 300

/**
 * The latest recaps and headlines. Public market news, no user data. The page
 * is answered from the shared publication cache; if headlines are stale or a recap is due, the
 * job runs afterwards in the background, so the next visit sees it.
 */
export const GET = withPublic<unknown>(async () => {
  const news = await readCachedNews()
  refreshNewsIfDue()
  return NextResponse.json(news, { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } })
})
