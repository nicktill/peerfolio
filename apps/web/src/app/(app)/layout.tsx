"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { AppNav } from "@web/components/app-nav"
import { Skeleton } from "@web/components/ui/skeleton"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (status === "unauthenticated") return null

  return (
    <div className="min-h-screen">
      <AppNav />
      {/* Bottom padding clears the mobile tab bar. */}
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:pb-12">{children}</main>
    </div>
  )
}
