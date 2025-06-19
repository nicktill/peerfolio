"use client"

import LandingComingSoon from "@web/components/landing-coming-soon"
import Loading from "@web/components/loading"
import { useTheme } from "@web/components/theme-provider"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export default function HomePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isVisible, setIsVisible] = useState(false)
  const { isDark, toggleDark } = useTheme()

  useEffect(() => {
    if (session) {
      router.push("/dashboard")
    }
  }, [session, router])

  // Fade in content after loading
  useEffect(() => {
    if (status !== "loading") {
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [status])

  if (status === "loading") {
    return <Loading variant="branded" />
  }

  if (session) {
    return null // Will redirect to dashboard
  }

  return (
    <div 
      className={`transition-opacity duration-500 ease-in-out min-h-screen bg-white ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <LandingComingSoon />
    </div>
  )
}
