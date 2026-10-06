import { NextResponse } from "next/server"
import { withPublic } from "@web/lib/api"
import { readNews } from "@web/lib/news"

export const dynamic = "force-dynamic"

/**
 * The latest recaps and headlines. Public market news, no user data, and only
 * database reads: visiting the page never calls a feed or the model.
 */
export const GET = withPublic<unknown>(async () => {
  const news = await readNews()
  return NextResponse.json(news, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } })
})
