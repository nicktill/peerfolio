"use client"

import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Loading from "@web/components/loading"
import Image from "next/image"
import { PortfolioDashboard } from "@web/components/portfolio-dashboard"
import { Button } from "@web/components/ui/button"
import { addConnectedAccount, getConnectedAccounts, type ConnectedAccount } from "@web/lib/account-storage"
import { useTheme } from "@web/components/theme-provider"

export default function DashboardPage() {  
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isVisible, setIsVisible] = useState(false)
  const [hasConnectedAccounts, setHasConnectedAccounts] = useState(false)
  const [plaidData, setPlaidData] = useState<any>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [hasExitedDashboard, setHasExitedDashboard] = useState(false)
  const { isDark, toggleDark } = useTheme()

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/")
    }
  }, [status, router])

  // Check for existing connected accounts on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check if user has explicitly exited the dashboard
      const exitedFlag = localStorage.getItem('hasExitedDashboard') === 'true'
      setHasExitedDashboard(exitedFlag)
      
      if (!exitedFlag) {
        const existingAccounts = getConnectedAccounts()
        if (existingAccounts.length > 0) {
          setHasConnectedAccounts(true)
        }
      }
      // If user has exited, keep hasConnectedAccounts as false to show landing screen
    }
  }, [])

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

      // Step 3: Save to localStorage and update state
      const newAccount: ConnectedAccount = {
        id: exchangeData.item_id || `account_${Date.now()}`,
        accessToken: exchangeData.access_token,
        institutionName: metadata?.institution?.name || accountsData.institution?.name || 'Unknown Bank',
        accountsData: accountsData,
        connectedAt: new Date().toISOString(),
        metadata: metadata
      }

      // Add to localStorage
      addConnectedAccount(newAccount)
      
      // Update component state - this ensures user sees connected accounts view
      setHasConnectedAccounts(true)
      
      // Clear the exit flag since user is now connecting an account
      if (typeof window !== 'undefined') {
        localStorage.removeItem('hasExitedDashboard')
        setHasExitedDashboard(false)
        // Set a flag to indicate we just connected an account (for UI flow)
        localStorage.setItem('lastConnectedAccount', 'true')
      }
      
      // For backwards compatibility, also set plaidData for the first account
      if (!plaidData) {
        setPlaidData(accountsData)
      }
      
      console.log("✅ Account successfully saved and connected!")
      
    } catch (error) {
      console.error("❌ Connection failed:", error)
      alert("Failed to connect account: " + (error instanceof Error ? error.message : "Unknown error"))
    } finally {
      setIsConnecting(false)
    }
  }

  const handleRemoveAccount = (accountId: string) => {
    const remainingAccounts = getConnectedAccounts()
    if (remainingAccounts.length === 0) {
      setHasConnectedAccounts(false)
      setPlaidData(null)
    }
  }

  const handleDemoConnect = () => {
    setHasConnectedAccounts(true)
    // Clear the exit flag since user is now entering demo mode
    if (typeof window !== 'undefined') {
      localStorage.removeItem('hasExitedDashboard')
      setHasExitedDashboard(false)
    }
  }

  const handleExitDashboard = () => {
    // Reset dashboard state without signing out
    setHasConnectedAccounts(false)
    setPlaidData(null)
    // Set exited flag but keep connected accounts in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('hasExitedDashboard', 'true')
      setHasExitedDashboard(true)
    }
  }

  if (status === "loading") {
    return <Loading variant="branded" />
  }

  if (!session) {
    return null
  }

  return (
    <div
      className={`min-h-screen bg-gray-50 dark:bg-background dark:text-foreground transition-opacity duration-500 ease-in-out ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Header */}
      <header className="bg-white dark:bg-background/90 shadow-sm border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-between items-center h-16 gap-2 md:gap-0">
            <div className="flex items-center space-x-3 min-w-0">
              <Image src="/logo.png" alt="Peerfolio" width={32} height={32} className="rounded-lg" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-foreground truncate">Peerfolio</h1>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4 flex-shrink-0">
              {/* Only keep one dark mode toggle button here, remove any duplicate at the end */}
              <Button
                variant="outline"
                size="icon"
                aria-label="Toggle dark mode"
                onClick={toggleDark}
                className="flex items-center justify-center border-gray-200 dark:border-gray-700 bg-white dark:bg-background hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {isDark ? (
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                ) : (
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                )}
              </Button>
              <div className="flex items-center space-x-3">
                {session.user?.image && (
                  <img src={session.user.image || "/placeholder.svg"} alt="Profile" className="h-8 w-8 rounded-full" />
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{session.user?.name}</span>
              </div>
              <Button onClick={() => signOut({ callbackUrl: "/" })} variant="outline" size="sm" className="ml-2">
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PortfolioDashboard 
          hasConnectedAccounts={hasConnectedAccounts} 
          onConnectAccount={handleConnectAccount}
          onRemoveAccount={handleRemoveAccount}
          onExitDashboard={handleExitDashboard}
          onDemoConnect={handleDemoConnect}
          hasExitedDashboard={hasExitedDashboard}
          plaidData={plaidData}
          isConnecting={isConnecting}
        />
      </main>
    </div>
  )
}
