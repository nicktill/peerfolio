"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { usePlaidLink } from "react-plaid-link"
import { Button } from "@web/components/ui/button"
import { Loader2, Plus, Building2 } from "lucide-react"

interface PlaidLinkProps {
  onSuccess: (publicToken: string, metadata: any) => void
  onExit?: (err: any, metadata: any) => void
  className?: string
  variant?: "default" | "secondary" | "outline"
  size?: "default" | "sm" | "lg"
  children?: React.ReactNode
}

export function PlaidLink({
  onSuccess,
  onExit,
  className,
  variant = "default",
  size = "default",
  children,
}: PlaidLinkProps) {
  const [loading, setLoading] = useState(false)

  const config = {
    token: process.env.NEXT_PUBLIC_PLAID_LINK_TOKEN || "link-sandbox-token", // In production, get this from your backend
    onSuccess: useCallback(
      (public_token: string, metadata: any) => {
        setLoading(false)
        onSuccess(public_token, metadata)
      },
      [onSuccess],
    ),
    onExit: useCallback(
      (err: any, metadata: any) => {
        setLoading(false)
        onExit?.(err, metadata)
      },
      [onExit],
    ),
    onEvent: useCallback((eventName: string, metadata: any) => {
      // Handle Plaid Link events
      console.log("Plaid Link Event:", eventName, metadata)
    }, []),
  }

  const { open, ready } = usePlaidLink(config)

  const handleClick = useCallback(() => {
    setLoading(true)
    // For demo mode, just call onSuccess immediately
    setTimeout(() => {
      setLoading(false)
      onSuccess("demo-token", { demo: true })
    }, 1000) // Add a small delay to show loading state
  }, [onSuccess])

  return (
    <Button onClick={handleClick} disabled={!ready || loading} variant={variant} size={size} className={className}>
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
      {children || "Connect Account"}
    </Button>
  )
}

// Hero component for connecting first account
export function PlaidConnectHero({ onSuccess }: { onSuccess: (publicToken: string, metadata: any) => void }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Connect Your Investment Accounts</h2>
          <p className="text-lg text-gray-600 leading-relaxed">
            Securely link your brokerage accounts to see your complete portfolio in one beautiful dashboard. We support
            12,000+ financial institutions.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 opacity-60">
          {["Robinhood", "Fidelity", "Charles Schwab", "E*TRADE"].map((broker) => (
            <div key={broker} className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="w-8 h-8 bg-gray-200 rounded mx-auto mb-2"></div>
              <span className="text-xs text-gray-500 font-medium">{broker}</span>
            </div>
          ))}
        </div>

        <PlaidLink
          onSuccess={onSuccess}
          size="lg"
          className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:via-emerald-700 hover:to-teal-700 text-white font-semibold px-8 py-4 text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
        >
          Connect Your First Account
        </PlaidLink>

        <div className="mt-6 flex items-center justify-center space-x-6 text-sm text-gray-500">
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
  )
}
