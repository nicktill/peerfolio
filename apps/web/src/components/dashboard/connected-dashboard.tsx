"use client"

import { useState } from "react"
import { motion } from "framer-motion"
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

  return (    <div className="space-y-8">
      {/* Portfolio Overview Header */}
      <motion.div 
        className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 p-8"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-8 space-y-4 lg:space-y-0">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-transparent">
              Portfolio Overview
            </h1>
            <p className="text-gray-600 text-lg">Track your investment performance across all accounts</p>
          </div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <PlaidLinkButton
              onSuccess={handleAddAccount}
              isLoading={isAddingAccount}
              className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-6 py-3 rounded-full text-sm font-semibold shadow-lg hover:shadow-xl transition-all duration-300 flex items-center space-x-2"
            >
              {isAddingAccount ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Plus size={18} />
                  <span>Connect Account</span>
                </>
              )}
            </PlaidLinkButton>
          </motion.div>
        </div>

        <PortfolioStats totalValue={totalValue} performanceData={performanceData} />
      </motion.div>

      {/* Main Portfolio Chart */}
      <motion.div 
        className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 p-8"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-gray-900">Net Worth Trajectory</h2>
            <p className="text-gray-600">Your portfolio's performance over time</p>
          </div>
          <div className="flex items-center space-x-3 bg-emerald-50 px-4 py-2 rounded-full">
            <TrendingUp size={18} className="text-emerald-600" />
            <span className="text-emerald-700 font-semibold">+23.4% YTD</span>
          </div>
        </div>
        <PortfolioChart data={performanceData} />
      </motion.div>      {/* Two Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
        {/* Connected Accounts - Takes up 3 columns */}
        <motion.div 
          className="xl:col-span-3 bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 p-8"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-gray-900">Connected Accounts</h2>
              <p className="text-gray-600">Manage your linked investment accounts</p>
            </div>
            <div className="flex items-center space-x-2 bg-gray-50 px-3 py-2 rounded-full">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-700">Live</span>
            </div>
          </div>
          <ConnectedAccounts accounts={connectedAccounts} />
        </motion.div>

        {/* Asset Allocation - Takes up 2 columns */}
        <motion.div 
          className="xl:col-span-2 bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 p-8"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <div className="space-y-1 mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Asset Allocation</h2>
            <p className="text-gray-600">Portfolio breakdown by asset type</p>
          </div>
          <AssetAllocation data={assetAllocation} />
        </motion.div>
      </div>

      {/* Additional Insights Row */}
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        <div className="bg-gradient-to-br from-blue-50 to-indigo-100/50 rounded-2xl p-6 border border-blue-200/30">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold text-blue-900">Monthly Goal</h3>
          </div>
          <div className="space-y-2">
            <p className="text-2xl font-bold text-blue-900">87%</p>
            <p className="text-sm text-blue-700">$2,100 of $2,500 target</p>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full" style={{ width: '87%' }}></div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-2xl p-6 border border-purple-200/30">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold text-purple-900">Risk Score</h3>
          </div>
          <div className="space-y-2">
            <p className="text-2xl font-bold text-purple-900">Moderate</p>
            <p className="text-sm text-purple-700">6.2/10 risk level</p>
            <div className="flex space-x-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full ${
                    i <= 6 ? 'bg-purple-500' : 'bg-purple-200'
                  }`}
                ></div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-2xl p-6 border border-emerald-200/30">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold text-emerald-900">Next Milestone</h3>
          </div>
          <div className="space-y-2">
            <p className="text-2xl font-bold text-emerald-900">$50K</p>
            <p className="text-sm text-emerald-700">$4,250 remaining</p>
            <div className="w-full bg-emerald-200 rounded-full h-2">
              <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '91.5%' }}></div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
