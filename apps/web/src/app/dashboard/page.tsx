"use client"

import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Loading from "@web/components/loading"
import Image from "next/image"
import { DashboardHeader } from "@web/components/dashboard/dashboard-header"
import { DashboardContent } from "@web/components/dashboard/dashboard-content"

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isVisible, setIsVisible] = useState(false)
  const [connectedAccounts, setConnectedAccounts] = useState([]) // Will store Plaid account data

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/")
    }
  }, [status, router])

  // Fade in dashboard after loading
  useEffect(() => {
    if (status === "authenticated" && session) {
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [status, session])

  if (status === "loading") {
    return <Loading variant="pulse" />
  }

  if (!session) {
    return null
  }

  return (
    <div 
      className={`min-h-screen bg-gray-50 transition-opacity duration-500 ease-in-out ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <DashboardHeader session={session} onSignOut={() => signOut({ callbackUrl: "/" })} />
      <DashboardContent 
        session={session} 
        connectedAccounts={connectedAccounts}
        setConnectedAccounts={setConnectedAccounts}
      />
    </div>
  )
}
