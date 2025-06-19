"use client"

import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Loading from "@web/components/loading"
import Image from "next/image"
import { PortfolioDashboard } from "@web/components/portfolio-dashboard"
import { Button } from "@web/components/ui/button"

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isVisible, setIsVisible] = useState(false)
  const [hasConnectedAccounts, setHasConnectedAccounts] = useState(false)

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

  const handleConnectAccount = (publicToken?: string, metadata?: any) => {
    console.log("Demo connection:", { publicToken, metadata })
    // For demo purposes, just show the connected dashboard
    setHasConnectedAccounts(true)
  }

  const handleDemoConnect = () => {
    setHasConnectedAccounts(true)
  }

  if (status === "loading") {
    return <Loading variant="pulse" />
  }

  if (!session) {
    return null
  }

  return (
    <div
      className={`min-h-screen bg-gray-50 transition-opacity duration-500 ease-in-out ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-3">
                <Image src="/logo.png" alt="Peerfolio" width={32} height={32} className="rounded-lg" />
                <h1 className="text-xl font-semibold text-gray-900">Peerfolio</h1>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                {session.user?.image && (
                  <img src={session.user.image || "/placeholder.svg"} alt="Profile" className="h-8 w-8 rounded-full" />
                )}
                <span className="text-sm font-medium text-gray-700">{session.user?.name}</span>
              </div>
              <Button onClick={() => signOut({ callbackUrl: "/" })} variant="outline" size="sm">
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PortfolioDashboard hasConnectedAccounts={hasConnectedAccounts} onConnectAccount={handleConnectAccount} />
      </main>
    </div>
  )
}
