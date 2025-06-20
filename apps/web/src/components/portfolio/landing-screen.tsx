"use client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@web/components/ui/card"
import { Button } from "@web/components/ui/button"
import { PlaidLink } from "../plaid-link"
import { PieChart, Building2, RefreshCw, TrendingUp } from "lucide-react"

interface LandingScreenProps {
  isConnecting: boolean
  onDemoConnect: () => void
  onConnectAccount: (publicToken: string, metadata: any) => void
  getConnectedAccounts: () => any[]
}

export function LandingScreen({
  isConnecting,
  onDemoConnect,
  onConnectAccount,
  getConnectedAccounts,
}: LandingScreenProps) {
  return (
    <div className="space-y-8">
      {/* MVP Beta Testing Banner */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-purple-950/40 border border-blue-200 dark:border-blue-800/50 rounded-xl p-5 backdrop-blur-sm shadow-lg dark:shadow-blue-900/10 hover:shadow-xl transition-all duration-300">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-2 5a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-2">
              🚀 Welcome to Peerfolio MVP
              <span className="bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium px-2 py-1 rounded-full">
                Beta Testing
              </span>
            </h3>
            <div className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
              <p>
                <strong>Demo Mode:</strong> Explore with sample portfolio data to see all features in action
              </p>
              <p>
                <strong>Connect Account:</strong> Use Plaid's sandbox environment (mock data) while we await production
                approval
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="text-center py-12 sm:py-16 px-4 sm:px-6 bg-gradient-to-br from-emerald-50 via-white to-blue-50 dark:from-gray-900/80 dark:via-gray-800/90 dark:to-gray-900/80 rounded-3xl border border-gray-100 dark:border-gray-700/60 backdrop-blur-sm shadow-xl dark:shadow-gray-900/20">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
              <PieChart className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-foreground mb-4">
              Your Portfolio Dashboard Awaits
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 leading-relaxed">
              Connect your investment accounts to see your complete portfolio in one beautiful, secure dashboard. Track
              performance, analyze allocations, and compare with friends.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 opacity-60">
            {[
              { name: "Robinhood", logo: "https://logo.clearbit.com/robinhood.com" },
              { name: "Fidelity", logo: "https://logo.clearbit.com/fidelity.com" },
              { name: "Charles Schwab", logo: "https://logo.clearbit.com/schwab.com" },
              { name: "E*TRADE", logo: "https://logo.clearbit.com/etrade.com" },
            ].map((broker) => (
              <div key={broker.name} className="flex flex-col items-center space-y-2">
                <div className="flex items-center justify-center">
                  <img
                    src={broker.logo || "/placeholder.svg"}
                    alt={`${broker.name} logo`}
                    className="w-6 h-6 object-contain"
                    onError={(e) => {
                      // Fallback to colored initials if logo fails
                      const target = e.target as HTMLImageElement
                      const parent = target.parentElement
                      if (parent) {
                        parent.innerHTML = `<div class="w-6 h-6 rounded bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">${broker.name.charAt(0)}</div>`
                      }
                    }}
                  />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{broker.name}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
            <Button
              onClick={() => {
                // Ensure clean demo mode state
                if (onDemoConnect) onDemoConnect()
                // Clear any exit flags to ensure user can see the demo
                if (typeof window !== "undefined") {
                  localStorage.removeItem("hasExitedDashboard")
                }
              }}
              size="lg"
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium px-6 py-3 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 rounded-lg flex items-center"
            >
              <PieChart className="w-4 h-4 mr-2" />
              View Demo Portfolio
            </Button>

            {(() => {
              // Check if there are existing accounts in localStorage
              const existingAccounts = getConnectedAccounts()

              if (existingAccounts.length > 0) {
                // If accounts exist, show button that takes user to dashboard
                return (
                  <Button
                    onClick={() => {
                      // Clear exit flag and ensure real account mode
                      if (typeof window !== "undefined") {
                        localStorage.removeItem("hasExitedDashboard")
                      }
                      // Call demo connect handler to trigger parent state update
                      if (onDemoConnect) {
                        onDemoConnect()
                      }
                    }}
                    size="lg"
                    className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-medium px-6 py-3 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 rounded-lg flex items-center"
                  >
                    <Building2 className="w-4 h-4 mr-2" />
                    View Connected Accounts
                  </Button>
                )
              } else {
                // If no accounts exist, show Plaid link
                return (
                  <PlaidLink
                    onSuccess={onConnectAccount}
                    size="lg"
                    className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-medium px-6 py-3 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 rounded-lg flex items-center"
                  >
                    <Building2 className="w-4 h-4 mr-2" />
                    Connect Real Account
                  </PlaidLink>
                )
              }
            })()}
          </div>

          {isConnecting && (
            <div className="mt-6 text-center">
              <div className="inline-flex items-center px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-full text-emerald-600 dark:text-emerald-400 text-sm font-medium">
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Connecting your account...
              </div>
            </div>
          )}

          <div className="mt-4 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              <span className="font-medium text-blue-600 dark:text-blue-400">Demo:</span> See how the dashboard works
              with sample data
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Real Account:</span> Connect your
              actual investment accounts
            </p>
          </div>

          <div className="mt-6 flex items-center justify-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>Bank-level security</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>Read-only access</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <span>Encrypted data</span>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Cards */}
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="relative overflow-hidden border border-gray-200 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-lg dark:shadow-gray-900/20 hover:shadow-xl dark:hover:shadow-gray-900/30 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-emerald-600/5 dark:from-emerald-500/10 dark:to-emerald-600/10"></div>
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <TrendingUp className="w-5 h-5" />
              Portfolio Growth
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              Track your investment performance over time
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            <div className="h-32 bg-gradient-to-r from-emerald-100 to-emerald-200 dark:from-emerald-900/30 dark:to-emerald-800/30 rounded-lg flex items-center justify-center shadow-inner">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Beautiful charts await</span>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border border-gray-200 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-lg dark:shadow-gray-900/20 hover:shadow-xl dark:hover:shadow-gray-900/30 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-blue-600/5 dark:from-blue-500/10 dark:to-blue-600/10"></div>
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <PieChart className="w-5 h-5" />
              Asset Allocation
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              Visualize your investment distribution
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            <div className="h-32 bg-gradient-to-r from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 rounded-lg flex items-center justify-center shadow-inner">
              <span className="text-blue-600 dark:text-blue-400 font-medium">Interactive breakdowns</span>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border border-gray-200 dark:border-gray-700/50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-lg dark:shadow-gray-900/20 hover:shadow-xl dark:hover:shadow-gray-900/30 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-purple-600/5 dark:from-purple-500/10 dark:to-purple-600/10"></div>
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
              <Building2 className="w-5 h-5" />
              Account Overview
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              All your accounts in one place
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            <div className="h-32 bg-gradient-to-r from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30 rounded-lg flex items-center justify-center shadow-inner">
              <span className="text-purple-600 dark:text-purple-400 font-medium">Unified dashboard</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
