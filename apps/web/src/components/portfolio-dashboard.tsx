"use client"

import { useState, useEffect } from "react"
import { removeConnectedAccount, getConnectedAccounts } from "@web/lib/account-storage"

// Import modular components
import { PortfolioHeader } from "./portfolio/portfolio-header"
import { StatusBanners } from "./portfolio/status-banners"
import { PortfolioMetrics } from "./portfolio/portfolio-metrics"
import { PortfolioChart } from "./portfolio/portfolio-chart"
import { TopHoldings } from "./portfolio/top-holdings"
import { AssetAllocation } from "./portfolio/asset-allocation"
import { ConnectedAccounts } from "./portfolio/connected-accounts"
import { LandingScreen } from "./portfolio/landing-screen"
import { PlaidDebugPanel } from "./portfolio/plaid-debug-panel"

// Import utilities and data
import { usePortfolioData } from "./portfolio/use-portfolio-data"
import {
  getAccountTypeIcon,
  formatAccountName,
  getInstitutionDisplayName,
  getStockIcon,
} from "./portfolio/portfolio-utils"

interface PlaidMetadata {
  institution?: {
    name?: string
    institution_id?: string
  }
}

interface PortfolioDashboardProps {
  hasConnectedAccounts: boolean
  onConnectAccount: (publicToken: string, metadata: PlaidMetadata) => void
  plaidData?: any
  isConnecting?: boolean
  onRemoveAccount?: (accountId: string) => void
  onExitDashboard?: () => void
  onDemoConnect?: () => void
  hasExitedDashboard?: boolean
  balanceVisible?: boolean
  setBalanceVisible?: (visible: boolean) => void
}

export function PortfolioDashboard({
  hasConnectedAccounts,
  onConnectAccount,
  plaidData,
  isConnecting = false,
  onRemoveAccount,
  onExitDashboard,
  onDemoConnect,
  hasExitedDashboard = false,
  balanceVisible: externalBalanceVisible,
  setBalanceVisible: externalSetBalanceVisible,
}: PortfolioDashboardProps) {
  const [localBalanceVisible, setLocalBalanceVisible] = useState(true)
  const [isDemoMode, setIsDemoMode] = useState(false)

  // Use external balance visibility state if provided, otherwise use local state
  const balanceVisible = externalBalanceVisible !== undefined ? externalBalanceVisible : localBalanceVisible
  const setBalanceVisible = externalSetBalanceVisible || setLocalBalanceVisible

  // Custom CSS animations
  useEffect(() => {
    if (typeof document !== "undefined") {
      const style = document.createElement("style")
      style.textContent = `
        @keyframes expandWidth {
          from { width: 0%; }
          to { width: var(--final-width, 100%); }
        }
        
        @keyframes slideToPosition {
          from { left: 0%; }
          to { left: var(--final-position, 100%); }
        }
        
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        @keyframes shimmer-slow {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        
        @keyframes float-1 {
          0%, 100% { transform: translateY(0px) translateX(-50%); }
          50% { transform: translateY(-10px) translateX(-50%); }
        }
        
        @keyframes float-2 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        
        @keyframes float-3 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
        
        .animate-shimmer-slow {
          animation: shimmer-slow 3s infinite;
        }
        
        .animate-float-1 {
          animation: float-1 2s ease-in-out infinite;
        }
        
        .animate-float-2 {
          animation: float-2 2.5s ease-in-out infinite;
        }
        
        .animate-float-3 {
          animation: float-3 3s ease-in-out infinite;
        }
        
        .animation-delay-150 {
          animation-delay: 150ms;
        }
        
        .animation-delay-300 {
          animation-delay: 300ms;
        }
        
        .animation-delay-600 {
          animation-delay: 600ms;
        }
      `
      document.head.appendChild(style)

      return () => {
        document.head.removeChild(style)
      }
    }
  }, [])

  // Use the portfolio data hook
  const {
    accountsWithPercentages,
    balanceSummary,
    totalBalance,
    chartData,
    totalGain,
    totalGainPercentage,
    todaysChange,
    topHoldings,
    assetAllocation,
    selectedTimeframe,
    setSelectedTimeframe,
    connectedPlaidAccounts,
    setConnectedPlaidAccounts,
    chartKey,
    useAssetsOnlyForChart,
  } = usePortfolioData(isDemoMode, hasConnectedAccounts, plaidData)

  // Load connected accounts from localStorage on mount and when hasConnectedAccounts changes
  useEffect(() => {
    const stored = getConnectedAccounts()
    setConnectedPlaidAccounts(stored)

    // Check if user just connected an account and should see connected accounts view
    if (typeof window !== "undefined") {
      const justConnected = localStorage.getItem("lastConnectedAccount") === "true"
      if (justConnected && stored.length > 0) {
        // Clear the flag and ensure user sees connected accounts (not demo mode)
        localStorage.removeItem("lastConnectedAccount")
        setIsDemoMode(false) // Ensure we're not in demo mode
      }
    }
  }, [hasConnectedAccounts, hasExitedDashboard, setConnectedPlaidAccounts])

  // Show dashboard if user has connected accounts OR is in demo mode, BUT NOT if they've explicitly exited
  const showDashboard = !hasExitedDashboard && (hasConnectedAccounts || isDemoMode || connectedPlaidAccounts.length > 0)

  // Function to remove a connected account
  const handleRemoveAccount = (accountId: string) => {
    removeConnectedAccount(accountId)
    setConnectedPlaidAccounts(getConnectedAccounts())

    // Notify parent component if provided
    if (onRemoveAccount) {
      onRemoveAccount(accountId)
    }
  }

  const formatCurrency = (value: number) => {
    if (!balanceVisible) return "••••••"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatPercentage = (value: number) => {
    if (!balanceVisible) return "••••"
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`
  }

  if (!showDashboard) {
    return (
      <LandingScreen
        isConnecting={isConnecting}
        onDemoConnect={() => {
          // Ensure clean demo mode state
          setIsDemoMode(true)
          // Clear any exit flags to ensure user can see the demo
          if (typeof window !== "undefined") {
            localStorage.removeItem("hasExitedDashboard")
          }
          // Call demo connect handler if provided
          if (onDemoConnect) onDemoConnect()
        }}
        onConnectAccount={onConnectAccount}
        getConnectedAccounts={getConnectedAccounts}
      />
    )
  }

  return (
    <div className="space-y-8 dark:text-foreground text-gray-900 transition-colors duration-300">
      <StatusBanners isDemoMode={isDemoMode} hasConnectedAccounts={hasConnectedAccounts} />

      <PortfolioHeader
        isDemoMode={isDemoMode}
        hasConnectedAccounts={hasConnectedAccounts}
        connectedPlaidAccounts={connectedPlaidAccounts}
        balanceVisible={balanceVisible}
        setBalanceVisible={setBalanceVisible}
        setIsDemoMode={setIsDemoMode}
        onConnectAccount={onConnectAccount}
        onExitDashboard={() => {
          // Reset demo mode
          setIsDemoMode(false)
          // Clear connected accounts from localStorage to reset dashboard state
          if (typeof window !== "undefined") {
            localStorage.removeItem("connectedAccounts")
          }
          // Reset local state
          setConnectedPlaidAccounts([])
          // Call the exit function if provided to reset parent state
          if (onExitDashboard) {
            onExitDashboard()
          }
          // This will cause showDashboard to be false and show the landing screen
        }}
      />

      <PortfolioMetrics
        totalBalance={totalBalance}
        totalGain={totalGain}
        totalGainPercentage={totalGainPercentage}
        todaysChange={todaysChange}
        accountsCount={accountsWithPercentages.length}
        balanceSummary={balanceSummary}
        formatCurrency={formatCurrency}
        isDemoMode={isDemoMode}
        hasRealData={hasConnectedAccounts || connectedPlaidAccounts.length > 0}
        formatPercentage={formatPercentage}
        selectedTimeframe={selectedTimeframe}
        chartData={chartData}
        connectedPlaidAccounts={connectedPlaidAccounts}
        externalBalanceVisible={balanceVisible}
      />

      {/* Portfolio Performance Chart with Top Holdings */}
      <div className="grid gap-6 lg:grid-cols-3">
        <PortfolioChart
          chartData={chartData}
          chartKey={chartKey}
          selectedTimeframe={selectedTimeframe}
          setSelectedTimeframe={setSelectedTimeframe}
          formatCurrency={formatCurrency}
          isDemoMode={isDemoMode}
          hasRealData={hasConnectedAccounts || connectedPlaidAccounts.length > 0}
          useAssetsOnlyForChart={useAssetsOnlyForChart}
          balanceVisible={balanceVisible}
        />

        <TopHoldings
          topHoldings={topHoldings}
          formatCurrency={formatCurrency}
          isDemoMode={isDemoMode}
          hasRealData={hasConnectedAccounts || connectedPlaidAccounts.length > 0}
          formatPercentage={formatPercentage}
          getStockIcon={getStockIcon}
          balanceVisible={balanceVisible}
        />
      </div>

      {/* Asset Allocation and Connected Accounts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <AssetAllocation
          assetAllocation={assetAllocation}
          formatCurrency={formatCurrency}
          isDemoMode={isDemoMode}
          hasRealData={hasConnectedAccounts || connectedPlaidAccounts.length > 0}
          balanceVisible={balanceVisible}
        />

        <ConnectedAccounts
          accountsWithPercentages={accountsWithPercentages}
          balanceSummary={balanceSummary}
          formatCurrency={formatCurrency}
          isDemoMode={isDemoMode}
          hasRealData={hasConnectedAccounts || connectedPlaidAccounts.length > 0}
          getInstitutionDisplayName={getInstitutionDisplayName}
          formatAccountName={formatAccountName}
          getAccountTypeIcon={getAccountTypeIcon}
          handleRemoveAccount={handleRemoveAccount}
          onConnectAccount={onConnectAccount}
        />
      </div>

      <PlaidDebugPanel plaidData={plaidData} />
    </div>
  )
}
