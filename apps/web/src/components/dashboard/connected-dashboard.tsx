"use client"

import { useState } from "react"
import { PortfolioChart } from "./portfolio-chart"
import { ConnectedAccounts } from "./connected-accounts"
import { AssetAllocation } from "./asset-allocation"
import { PortfolioStats } from "./portfolio-stats"
import { TrendingUp, Plus } from "lucide-react"
import { PlaidLinkButton } from "./plaid-link-button"

interface ConnectedDashboardProps {
  session: any
  connectedAccounts: any[]
  setConnectedAccounts: (accounts: any[]) => void
}

export function ConnectedDashboard({ 
  session, 
  connectedAccounts, 
  setConnectedAccounts 
}: ConnectedDashboardProps) {
  const [isAddingAccount, setIsAddingAccount] = useState(false)

  // Calculate total portfolio value
  const totalValue = connectedAccounts.reduce((sum, account) => sum + (account.balance || 0), 0)

  // Mock portfolio performance data
  const performanceData = [
    { date: '2024-01', value: 35000 },
    { date: '2024-02', value: 37500 },
    { date: '2024-03', value: 39200 },
    { date: '2024-04', value: 38800 },
    { date: '2024-05', value: 42100 },
    { date: '2024-06', value: 45750 },
  ]

  // Mock asset allocation data
  const assetAllocation = [
    { name: 'Stocks', value: 65, amount: totalValue * 0.65, color: '#10B981' },
    { name: 'Bonds', value: 20, amount: totalValue * 0.20, color: '#3B82F6' },
    { name: 'ETFs', value: 10, amount: totalValue * 0.10, color: '#8B5CF6' },
    { name: 'Cash', value: 5, amount: totalValue * 0.05, color: '#6B7280' },
  ]

  const handleAddAccount = (publicToken: string, metadata: any) => {
    setIsAddingAccount(true)
    
    // Simulate adding a new account
    setTimeout(() => {
      const newAccount = {
        id: `account_${Date.now()}`,
        name: `${metadata.institution.name} Account`,
        balance: Math.floor(Math.random() * 50000) + 10000,
        type: 'investment',
        institution: metadata.institution.name
      }
      
      setConnectedAccounts([...connectedAccounts, newAccount])
      setIsAddingAccount(false)
    }, 2000)
  }

  return (
    <div className="space-y-8">
      {/* Portfolio Overview Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Portfolio Overview</h1>
            <p className="text-gray-600">Track your investment performance across all accounts</p>
          </div>
          <PlaidLinkButton
            onSuccess={handleAddAccount}
            isLoading={isAddingAccount}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center space-x-2"
          >
            {isAddingAccount ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Adding...</span>
              </>
            ) : (
              <>
                <Plus size={16} />
                <span>Add Account</span>
              </>
            )}
          </PlaidLinkButton>
        </div>

        <PortfolioStats totalValue={totalValue} performanceData={performanceData} />
      </div>

      {/* Main Portfolio Chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Net Worth Over Time</h2>
          <div className="flex items-center space-x-1 text-emerald-600">
            <TrendingUp size={16} />
            <span className="text-sm font-medium">+23.4% YTD</span>
          </div>
        </div>
        <PortfolioChart data={performanceData} />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Connected Accounts */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Connected Accounts</h2>
          <ConnectedAccounts accounts={connectedAccounts} />
        </div>

        {/* Asset Allocation */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Asset Allocation</h2>
          <AssetAllocation data={assetAllocation} />
        </div>
      </div>
    </div>
  )
}
