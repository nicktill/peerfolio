import { NextResponse } from "next/server"
import { withPublic } from "@web/lib/api"
import { readNews } from "@web/lib/news"

export const dynamic = "force-dynamic"

/** Published briefings and headlines. Database reads only; visitors never trigger jobs. */
export const GET = withPublic<unknown>(async () => {
  const news = await readNews()
  return NextResponse.json(news, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } })
})
