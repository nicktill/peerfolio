"use client"

import { useState } from "react"
import { motion } from "framer-motion"
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

  return (    <div className="max-w-5xl mx-auto">
      {/* Welcome Hero */}
      <motion.div 
        className="text-center mb-12"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div 
          className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-3xl mb-6 shadow-lg"
          whileHover={{ scale: 1.1, rotate: 5 }}
          transition={{ duration: 0.3 }}
        >
          <TrendingUp className="w-10 h-10 text-emerald-600" />
        </motion.div>
        <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-transparent mb-6">
          Welcome to Peerfolio, {firstName}! 👋
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
          Connect your investment accounts to see your complete financial picture, 
          track performance, and compare with friends in a secure, social environment.
        </p>
      </motion.div>

      {/* Connection CTA */}
      <motion.div 
        className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-10 mb-12"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div className="text-center mb-10">
          <motion.div
            className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-200 rounded-2xl mb-6"
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.3 }}
          >
            <Link2 className="w-8 h-8 text-blue-600" />
          </motion.div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Connect Your Investment Accounts
          </h2>
          <p className="text-gray-600 mb-10 text-lg max-w-2xl mx-auto">
            Securely link your brokerage accounts to start building your portfolio dashboard.
            We use bank-level security to protect your information.
          </p>
          
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <PlaidLinkButton
              onSuccess={handlePlaidSuccess}
              isLoading={isConnecting}
              className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-emerald-800 hover:from-emerald-700 hover:via-emerald-800 hover:to-emerald-900 text-white px-10 py-4 rounded-full text-lg font-semibold shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:scale-105"
            >
              {isConnecting ? (
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  <span>Connecting your accounts...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-3">
                  <Link2 className="w-6 h-6" />
                  <span>Connect First Account</span>
                  <ArrowRight className="w-5 h-5" />
                </div>
              )}
            </PlaidLinkButton>
          </motion.div>
        </div>        {/* Supported Brokerages Preview */}
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
        </div>      </motion.div>

      {/* Features Grid */}
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <motion.div 
          className="bg-white/70 backdrop-blur-xl rounded-2xl p-8 shadow-xl border border-white/20 hover:shadow-2xl transition-all duration-300"
          whileHover={{ scale: 1.02, y: -5 }}
          transition={{ duration: 0.3 }}
        >
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-2xl mb-6">
            <TrendingUp className="w-7 h-7 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">
            Portfolio Tracking
          </h3>
          <p className="text-gray-600">
            See all your investments in one place with real-time updates and performance tracking.
          </p>
        </motion.div>

        <motion.div 
          className="bg-white/70 backdrop-blur-xl rounded-2xl p-8 shadow-xl border border-white/20 hover:shadow-2xl transition-all duration-300"
          whileHover={{ scale: 1.02, y: -5 }}
          transition={{ duration: 0.3 }}
        >
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl mb-6">
            <Users className="w-7 h-7 text-blue-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">
            Social Investing
          </h3>
          <p className="text-gray-600">
            Create groups with friends, compare performance, and learn from each other's strategies.
          </p>
        </motion.div>

        <motion.div 
          className="bg-white/70 backdrop-blur-xl rounded-2xl p-8 shadow-xl border border-white/20 hover:shadow-2xl transition-all duration-300"
          whileHover={{ scale: 1.02, y: -5 }}
          transition={{ duration: 0.3 }}
        >
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-purple-100 to-purple-200 rounded-2xl mb-6">
            <Shield className="w-7 h-7 text-purple-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">
            Bank-Level Security
          </h3>
          <p className="text-gray-600">
            Your data is encrypted and secure. We never store your login credentials.
          </p>
        </motion.div>
      </motion.div>

      {/* Security Notice */}
      <motion.div 
        className="bg-white/70 backdrop-blur-xl rounded-2xl p-8 border border-white/20 shadow-xl"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
      >
        <div className="flex items-start space-x-4">
          <div className="p-3 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl">
            <Shield className="w-6 h-6 text-gray-600" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">Your Security is Our Priority</h4>
            <p className="text-gray-600">
              We use Plaid's secure connection technology, trusted by major financial institutions. 
              Your banking credentials are never shared with us, and all data is encrypted end-to-end.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
