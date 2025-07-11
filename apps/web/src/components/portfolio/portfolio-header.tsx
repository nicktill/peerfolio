"use client"
import { Button } from "@web/components/ui/button"
import { PlaidLink, type PlaidLinkRef } from "../plaid-link"
import { PieChart, Building2, Eye, EyeOff, X } from "lucide-react"
import { Toast } from "@web/components/ui/toast"
import React, { useState, useRef } from "react"
import { getConnectedAccounts } from "@web/lib/account-storage"

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
  onExitDashboard,
}: PortfolioHeaderProps) {
  // Toast state
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState("")
  const [toastEmoji, setToastEmoji] = useState("")

  // Ref to trigger PlaidLink programmatically
  const plaidTriggerRef = useRef<PlaidLinkRef>(null)

  // Toast timeout ref
  const toastTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  // Handler for toggling balance visibility with toast
  const handleToggleBalanceVisible = () => {
    setBalanceVisible(!balanceVisible)
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }
    if (balanceVisible) {
      setToastMessage("Sensitive values are now hidden")
      setToastEmoji("🙈")
    } else {
      setToastMessage("Sensitive values are now visible")
      setToastEmoji("👁️")
    }
    setShowToast(true)
    toastTimeoutRef.current = setTimeout(() => setShowToast(false), 2500)
  }

  // Handler for connecting accounts - triggers Plaid if no accounts exist
  const handleConnectOrView = () => {
    const existingAccounts = getConnectedAccounts()
    console.log("Checking existing accounts:", existingAccounts.length)

    if (existingAccounts.length > 0) {
      // Has accounts, switch to connected view
      console.log("Has accounts, switching to connected view")
      setIsDemoMode(false)
    } else {
      // No accounts exist, trigger Plaid connection directly
      console.log("No accounts found, triggering Plaid connection")
      if (plaidTriggerRef.current) {
        plaidTriggerRef.current.open()
      } else {
        console.error("PlaidLink ref not available")
      }
    }
  }

  // Enhanced onConnectAccount handler that auto-switches to connected view
  const handleAccountConnection = (publicToken: string, metadata: any) => {
    console.log("Account connected successfully, switching to connected view")
    // Call the original onConnectAccount handler
    onConnectAccount(publicToken, metadata)
    // Automatically switch to connected accounts view after successful connection
    setTimeout(() => {
      setIsDemoMode(false)
    }, 500) // Small delay to ensure the account is saved
  }

  return (
    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 lg:gap-0">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground whitespace-nowrap">
            Portfolio Dashboard
          </h1>
          {isDemoMode && (
            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-sm font-medium px-3 py-1 rounded-full whitespace-nowrap">
              Demo Mode
            </span>
          )}
          {hasConnectedAccounts && !isDemoMode && (
            <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-sm font-medium px-3 py-1 rounded-full whitespace-nowrap flex items-center gap-1">
              Connected
              <span className="hidden xs:inline">
                ({connectedPlaidAccounts.length} account{connectedPlaidAccounts.length !== 1 ? "s" : ""})
              </span>
            </span>
          )}
        </div>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          {isDemoMode
            ? "Explore with sample portfolio data"
            : hasConnectedAccounts
              ? "Real data from your connected accounts"
              : "Connect your accounts to see real portfolio data"}
        </p>
      </div>

      {/* Desktop Navigation and Controls - Original Layout */}
      <div className="hidden lg:flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
        {/* Navigation Buttons - First Section */}
        {(hasConnectedAccounts || connectedPlaidAccounts.length > 0 || isDemoMode) && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Button
              variant={isDemoMode ? "default" : "outline"}
              onClick={() => setIsDemoMode(true)}
              className="flex items-center gap-2 justify-center text-sm"
              size="sm"
            >
              <PieChart className="w-4 h-4" />
              <span className="hidden sm:inline">View Demo</span>
              <span className="sm:hidden">Demo</span>
            </Button>
            {(hasConnectedAccounts || connectedPlaidAccounts.length > 0) && (
              <Button
                variant={!isDemoMode ? "default" : "outline"}
                onClick={handleConnectOrView}
                className="flex items-center gap-2 justify-center text-sm"
                size="sm"
              >
                <Building2 className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {connectedPlaidAccounts.length > 0 ? "View Connected Accounts" : "Connect Real Account"}
                </span>
                <span className="sm:hidden">{connectedPlaidAccounts.length > 0 ? "Connected" : "Connect"}</span>
              </Button>
            )}
          </div>
        )}

        {/* Exit Dashboard, Hide and Add Account buttons - Second Section */}
        <div className="flex items-center gap-2">
          {/* Exit Dashboard Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onExitDashboard}
            className="flex items-center gap-2 flex-1 sm:flex-none justify-center"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Exit Dashboard</span>
            <span className="sm:hidden">Exit</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleBalanceVisible}
            className="flex items-center gap-2 flex-1 sm:flex-none justify-center min-w-[90px]"
            aria-label={balanceVisible ? "Hide values" : "Show values"}
          >
            <span className={balanceVisible ? "flex items-center gap-2" : "hidden items-center gap-2"}>
              <EyeOff className="w-4 h-4" />
              <span className="hidden sm:inline">Hide</span>
            </span>
            <span className={!balanceVisible ? "flex items-center gap-2" : "hidden items-center gap-2"}>
              <Eye className="w-4 h-4" />
              <span className="hidden sm:inline">Show</span>
            </span>
          </Button>

          <PlaidLink
            ref={plaidTriggerRef}
            onSuccess={handleAccountConnection}
            variant="outline"
            size="sm"
            className="flex items-center gap-2 flex-1 sm:flex-none justify-center"
          >
            <span className="hidden sm:inline">Add Account</span>
            <span className="sm:hidden">Add</span>
          </PlaidLink>
        </div>
      </div>

      {/* Mobile Navigation and Controls - Improved Layout */}
      <div className="flex lg:hidden flex-col gap-4 w-full mt-4">
        {(hasConnectedAccounts || connectedPlaidAccounts.length > 0 || isDemoMode) && (
          <>
            {/* Demo/Connected Toggle - Mobile */}
            <div className="flex items-center justify-center gap-2 mb-2">
              <Button
                variant={isDemoMode ? "default" : "ghost"}
                size="sm"
                onClick={() => setIsDemoMode(true)}
                className="flex-1 text-xs px-3 py-2 h-auto rounded-full shadow-sm"
              >
                <PieChart className="w-3 h-3 mr-1.5" />
                Demo
              </Button>
              <Button
                variant={!isDemoMode ? "default" : "ghost"}
                size="sm"
                onClick={handleConnectOrView}
                className="flex-1 text-xs px-3 py-2 h-auto rounded-full shadow-sm"
              >
                <Building2 className="w-3 h-3 mr-1.5" />
                Connected
              </Button>
            </div>

            {/* Action Buttons Row - Mobile */}
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onExitDashboard}
                className="flex-1 text-xs px-3 py-2 h-auto rounded-full shadow-sm"
              >
                <X className="w-3 h-3 mr-1" />
                Exit
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setBalanceVisible(!balanceVisible)}
                className="flex-1 text-xs px-3 py-2 h-auto rounded-full shadow-sm"
                aria-label={balanceVisible ? "Hide values" : "Show values"}
              >
                {balanceVisible ? (
                  <>
                    <EyeOff className="w-3 h-3 mr-1" />
                    Hide
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3 mr-1" />
                    Show
                  </>
                )}
              </Button>

              <PlaidLink
                onSuccess={handleAccountConnection}
                size="sm"
                className="flex-1 text-xs px-3 py-2 h-auto rounded-full shadow-sm"
              >
                Add
              </PlaidLink>
            </div>
          </>
        )}

        {/* If no accounts connected, show only Add Account button */}
        {!isDemoMode && !hasConnectedAccounts && connectedPlaidAccounts.length === 0 && (
          <PlaidLink
            onSuccess={handleAccountConnection}
            size="sm"
            className="w-full text-sm px-4 py-2 rounded-full shadow-sm"
          >
            Add Account
          </PlaidLink>
        )}
      </div>
      {/* Toast notification */}
      <Toast show={showToast} onClose={() => setShowToast(false)} message={toastMessage} emoji={toastEmoji} />
    </div>
  )
}
