"use client"

import React from "react"
import { Button } from "@web/components/ui/button"
import { PlaidLink } from "../plaid-link"
import { PieChart, Building2, Eye, EyeOff, X } from "lucide-react"

interface PortfolioHeaderProps {
  isDemoMode: boolean
  hasConnectedAccounts: boolean
  connectedPlaidAccounts: any[]
  balanceVisible: boolean
  setBalanceVisible: (visible: boolean) => void
  setIsDemoMode: (demo: boolean) => void
  onConnectAccount: (publicToken: string, metadata: any) => void
  onExitDashboard: () => void
}

export function PortfolioHeader({
  isDemoMode,
  hasConnectedAccounts,
  connectedPlaidAccounts,
  balanceVisible,
  setBalanceVisible,
  setIsDemoMode,
  onConnectAccount,
  onExitDashboard
}: PortfolioHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground">Portfolio Dashboard</h1>
          {isDemoMode && (
            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-sm font-medium px-3 py-1 rounded-full">
              Demo Mode
            </span>
          )}
          {hasConnectedAccounts && !isDemoMode && (
            <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-sm font-medium px-3 py-1 rounded-full">
              Connected ({connectedPlaidAccounts.length} account{connectedPlaidAccounts.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          {isDemoMode ? "Explore with sample portfolio data" :
           hasConnectedAccounts ? "Real data from your connected accounts" :
           "Connect your accounts to see real portfolio data"}
        </p>
      </div>
      
      {/* Navigation and Controls */}
      <div className="flex items-center gap-3">
        {/* Navigation Buttons - First Section */}
        {(hasConnectedAccounts || connectedPlaidAccounts.length > 0 || isDemoMode) && (
          <div className="flex items-center gap-2">
            <Button
              variant={isDemoMode ? "default" : "outline"}
              onClick={() => setIsDemoMode(true)}
              className="flex items-center gap-2 min-w-[120px] justify-center"
              size="sm"
            >
              <PieChart className="w-4 h-4" />
              View Demo
            </Button>
            {(hasConnectedAccounts || connectedPlaidAccounts.length > 0) && (
              <Button
                variant={!isDemoMode ? "default" : "outline"}
                onClick={() => {
                  // Only show connected accounts view if there are actually accounts
                  if (connectedPlaidAccounts.length > 0) {
                    setIsDemoMode(false)
                  } else {
                    // If no accounts exist, exit to landing screen to let user connect
                    if (onExitDashboard) {
                      onExitDashboard()
                    }
                  }
                }}
                className="flex items-center gap-2 min-w-[180px] justify-center"
                size="sm"
              >
                <Building2 className="w-4 h-4" />
                {connectedPlaidAccounts.length > 0 ? "View Connected Accounts" : "Connect Real Account"}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                // Reset demo mode
                setIsDemoMode(false)
                // Clear connected accounts from localStorage to reset dashboard state
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('connectedAccounts')
                }
                // Call the exit function if provided to reset parent state
                if (onExitDashboard) {
                  onExitDashboard()
                }
                // This will cause showDashboard to be false and show the landing screen
              }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 min-w-[120px] justify-center"
              size="sm"
            >
              <X className="w-4 h-4" />
              Exit Dashboard
            </Button>
          </div>
        )}
        
        {/* Hide and Add Account buttons - Second Section */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBalanceVisible(!balanceVisible)}
            className="flex items-center gap-2"
          >
            {balanceVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            Hide
          </Button>
          
          <PlaidLink 
            onSuccess={onConnectAccount} 
            variant="outline" 
            size="sm"
            className="flex items-center gap-2"
          >
            Add Account
          </PlaidLink>
        </div>
      </div>
    </div>
  )
}
