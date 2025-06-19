"use client"

import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Loading from "@web/components/loading"
import Image from "next/image"
import { PortfolioDashboard } from "@web/components/portfolio-dashboard"
import { Button } from "@web/components/ui/button"

export default function DashboardPage() {  const { data: session, status } = useSession()
  const router = useRouter()
  const [isVisible, setIsVisible] = useState(false)
  const [hasConnectedAccounts, setHasConnectedAccounts] = useState(false)
  const [plaidData, setPlaidData] = useState<any>(null)
  const [isConnecting, setIsConnecting] = useState(false)

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

  const handleConnectAccount = async (publicToken: string, metadata: any) => {
    console.log("🔄 Starting Plaid account connection:", { publicToken, metadata })
    setIsConnecting(true)
    
    try {
      // Step 1: Exchange public token for access token
      console.log("🔄 Exchanging public token...")
      const exchangeResponse = await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token: publicToken, metadata }),
      })

      const exchangeData = await exchangeResponse.json()
      
      if (!exchangeResponse.ok) {
        throw new Error(exchangeData.error || "Failed to exchange token")
      }

      console.log("✅ Token exchange successful:", exchangeData.item_id)

      // Step 2: Fetch account data
      console.log("🔄 Fetching account data...")
      const accountsResponse = await fetch("/api/plaid/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: exchangeData.access_token }),
      })

      const accountsData = await accountsResponse.json()
      
      if (!accountsResponse.ok) {
        throw new Error(accountsData.error || "Failed to fetch accounts")
      }

      console.log("✅ Account data fetched successfully:", accountsData)

      // Step 3: Update state with real data
      setPlaidData(accountsData)
      setHasConnectedAccounts(true)
      
    } catch (error) {
      console.error("❌ Connection failed:", error)
      alert("Failed to connect account: " + (error instanceof Error ? error.message : "Unknown error"))
    } finally {
      setIsConnecting(false)
    }
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
      </header>      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PortfolioDashboard 
          hasConnectedAccounts={hasConnectedAccounts} 
          onConnectAccount={handleConnectAccount}
          plaidData={plaidData}
          isConnecting={isConnecting}
        />
      </main>
    </div>
  )
}
