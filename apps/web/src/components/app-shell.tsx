"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { AppNav } from "@web/components/app-nav"
import { Aurora } from "@web/components/ui/aurora"
import { RouteProgress } from "@web/components/ui/route-progress"
import { moodFromPercent, useMoodOverride } from "@web/lib/mood"
import { useApi } from "@web/lib/use-api"

/**
 * The signed-in frame: nav and the page.
 *
 * It renders while the session is still being confirmed, rather than showing a
 * placeholder and swapping the whole frame in afterwards. Data routes check the
 * session themselves, so nothing private is exposed in the moment before a
 * signed-out visitor is redirected.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useSession()
  const router = useRouter()
  // The market's day colours the cursor's light: green on an up day, red on a down day. It's the S&P 500's
  // move, falling back to the portfolio's own when the market data isn't available. Both requests are
  // the ones the News and Portfolio pages make, so they're usually already cached.
  const signedIn = status === "authenticated"
  const { data: market } = useApi<{ board: { indexes: { key: string; day: { percent: number } }[] } | null }>(signedIn ? "/api/news/market?part=board" : null, [], { refreshMs: 300_000 })
  const { data: portfolio } = useApi<{ today: { percent: number } | null }>(signedIn ? "/api/portfolio?range=1W" : null, [], { refreshMs: 300_000 })
  const override = useMoodOverride()
  const indexes = market?.board?.indexes ?? []
  const marketPercent = (indexes.find((i) => i.key === "spx") ?? indexes[0])?.day.percent
  const mood = override ?? moodFromPercent(marketPercent ?? portfolio?.today?.percent)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  if (status === "unauthenticated") return null

  return (
    <div className="app-bg min-h-screen" data-mood={mood}>
      <Aurora />
      <RouteProgress />
      <AppNav />
      {/* Wide enough for a dashboard on a laptop; text-heavy pages set their own reading width. Bottom padding clears the mobile tab bar. */}
      <main className="mx-auto max-w-[1360px] px-4 pb-24 pt-6 sm:px-6 sm:pb-12">{children}</main>
    </div>
  )
}
