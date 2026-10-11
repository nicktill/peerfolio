"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { AppNav } from "@web/components/app-nav"
import { RouteProgress } from "@web/components/ui/route-progress"

/**
 * The signed-in frame: nav and the page.
 *
 * It renders while the session is still being confirmed, rather than showing a
 * placeholder and swapping the whole frame in afterwards. Data routes check the
 * session themselves, so nothing private is exposed in the moment before a
 * signed-out visitor is redirected.
 */
export function AppShell({ children, previewDemo = false }: { children: React.ReactNode; previewDemo?: boolean }) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  if (status === "unauthenticated") return null

  return (
    <div className="peerfolio-app min-h-screen">
      <RouteProgress />
      <AppNav />
      {/* Wide enough for a dashboard on a laptop; text-heavy pages set their own reading width. Bottom padding clears the mobile tab bar. */}
      {previewDemo && session?.user?.email?.endsWith("@example.com") ? <div className="pf-demo-pill" role="status">Demo data</div> : null}
      <main className="peerfolio-main">{children}</main>
    </div>
  )
}
