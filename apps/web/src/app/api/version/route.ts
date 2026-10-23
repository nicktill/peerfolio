import { NextResponse } from "next/server"

// Which deploy is live. The id is stamped in at build time (next.config.ts), so it always matches the JS that deploy ships.
export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json({ id: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" }, { headers: { "Cache-Control": "no-store" } })
}
