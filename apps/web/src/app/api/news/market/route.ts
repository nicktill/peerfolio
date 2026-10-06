import { NextResponse } from "next/server"
import { withPublic } from "@web/lib/api"
import { readNewsMarket } from "@web/lib/news-market-store"
export const dynamic = "force-dynamic"
/** Saved data only, including when providers are unavailable. */
export const GET = withPublic<unknown>(async () => NextResponse.json(await readNewsMarket(), { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } }))
