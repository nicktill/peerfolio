"use client"

import { useState } from "react"
import { TrendingUp, Shield, Zap, Users, ArrowRight, Link2 } from "lucide-react"
import { PlaidLinkButton } from "./plaid-link-button"

interface EmptyStateProps {
  session: any
  onAccountConnected: (accounts: any[]) => void
}

export function EmptyState({ session, onAccountConnected }: EmptyStateProps) {
  const [isConnecting, setIsConnecting] = useState(false)

  const handlePlaidSuccess = (publicToken: string, metadata: any) => {
    setIsConnecting(true)
    // Here you would exchange the public token for an access token
    // and fetch account data from your backend
    console.log("Plaid success:", { publicToken, metadata })
    
    // For now, we'll simulate a successful connection
    setTimeout(() => {
      onAccountConnected([
        {
          id: "demo_account",
          name: "Demo Investment Account",
          balance: 45750.32,
          type: "investment"
        }
      ])
      setIsConnecting(false)
    }, 2000)
  }

  const firstName = session.user?.name?.split(' ')[0] || 'there'

  return (
    <div className="max-w-4xl mx-auto">
      {/* Welcome Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-6">
          <TrendingUp className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to Peerfolio, {firstName}! 👋
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Connect your investment accounts to see your complete financial picture, 
          track performance, and compare with friends in a secure, social environment.
        </p>
      </div>

      {/* Connection CTA */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 mb-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Connect Your Investment Accounts
          </h2>
          <p className="text-gray-600 mb-8">
            Securely link your brokerage accounts to start building your portfolio dashboard.
            We use bank-level security to protect your information.
          </p>
          
          <PlaidLinkButton
            onSuccess={handlePlaidSuccess}
            isLoading={isConnecting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-full text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
          >
            {isConnecting ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Connecting...</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link2 className="w-5 h-5" />
                <span>Connect First Account</span>
              </div>
            )}
          </PlaidLinkButton>
        </div>

        {/* Supported Brokerages Preview */}
        <div className="border-t border-gray-200 pt-8">
          <p className="text-center text-sm text-gray-500 mb-4">
            Supported brokerages include:
          </p>
          <div className="flex flex-wrap justify-center items-center gap-6 opacity-60">
            {[
              "Fidelity", "Charles Schwab", "TD Ameritrade", "E*TRADE", 
              "Robinhood", "Vanguard", "Merrill Lynch", "Ally Invest"
            ].map((brokerage) => (
              <div key={brokerage} className="text-sm font-medium text-gray-400">
                {brokerage}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-lg mb-4">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Portfolio Tracking
          </h3>
          <p className="text-gray-600 text-sm">
            See all your investments in one place with real-time updates and performance tracking.
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg mb-4">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Social Investing
          </h3>
          <p className="text-gray-600 text-sm">
            Create groups with friends, compare performance, and learn from each other's strategies.
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-100 rounded-lg mb-4">
            <Shield className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Bank-Level Security
          </h3>
          <p className="text-gray-600 text-sm">
            Your data is encrypted and secure. We never store your login credentials.
          </p>
        </div>
      </div>

      {/* Security Notice */}
      <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
        <div className="flex items-start space-x-3">
          <Shield className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-gray-900 mb-1">Your Security is Our Priority</h4>
            <p className="text-sm text-gray-600">
              We use Plaid's secure connection technology, trusted by major financial institutions. 
              Your banking credentials are never shared with us, and all data is encrypted end-to-end.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
