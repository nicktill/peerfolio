"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { AppGutters } from "@web/components/app-gutters"
import { AppNav } from "@web/components/app-nav"
import { HeroBackdrop } from "@web/components/landing/hero-backdrop"

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

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  if (status === "unauthenticated") return null

  return (
    <div className="app-bg min-h-screen">
      <HeroBackdrop variant="app" />
      <AppGutters />
      <AppNav />
      {/* Bottom padding clears the mobile tab bar. */}
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:pb-12">{children}</main>
    </div>
  )
}
