"use client"

import type React from "react"
import { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from "react"
import { usePlaidLink } from "react-plaid-link"
import { Button } from "@web/components/ui/button"
import { Loader2, Plus, Building2, AlertCircle } from "lucide-react"

interface PlaidLinkProps {
  onSuccess: (publicToken: string, metadata: any) => void
  onExit?: (err: any, metadata: any) => void
  className?: string
  variant?: "default" | "secondary" | "outline"
  size?: "default" | "sm" | "lg"
  children?: React.ReactNode
}

export interface PlaidLinkRef {
  open: () => void
}

export const PlaidLink = forwardRef<PlaidLinkRef, PlaidLinkProps>(
  ({ onSuccess, onExit, className, variant = "default", size = "default", children }, ref) => {
    const [loading, setLoading] = useState(false)
    const [linkToken, setLinkToken] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Fetch link token from your backend
    useEffect(() => {
      const fetchLinkToken = async () => {
        try {
          setError(null)
          console.log("🔄 Fetching Plaid link token...")
          const response = await fetch("/api/plaid/create-link-token", {
            method: "POST",
          })

          const data = await response.json()

          if (!response.ok) {
            console.error("❌ Failed to create link token:", data)
            throw new Error(data.error || "Failed to create link token")
          }

          if (data.link_token) {
            setLinkToken(data.link_token)
            console.log("✅ Link token created successfully")
          } else {
            throw new Error("No link token received")
          }
        } catch (error) {
          console.error("Error fetching link token:", error)
          const errorMessage = error instanceof Error ? error.message : "Failed to initialize Plaid"
          setError(errorMessage)
          console.error("❌ Plaid Link initialization failed:", errorMessage)
        }
      }

      fetchLinkToken()
    }, [])

    const config = {
      token: linkToken,
      onSuccess: useCallback(
        (public_token: string, metadata: any) => {
          console.log("🎉 Plaid Link Success!", { public_token: public_token.substring(0, 20) + "...", metadata })
          setLoading(false)
          onSuccess(public_token, metadata)
        },
        [onSuccess],
      ),
      onExit: useCallback(
        (err: any, metadata: any) => {
          console.log("Plaid Link Exit:", { err, metadata })
          setLoading(false)
          if (err) {
            setError(err.error_message || "Connection cancelled")
          }
          onExit?.(err, metadata)
        },
        [onExit],
      ),
      onEvent: useCallback((eventName: string, metadata: any) => {
        console.log("Plaid Link Event:", eventName, metadata)
      }, []),
    }

    const { open, ready } = usePlaidLink(config)

    // Expose the open function through the ref
    useImperativeHandle(
      ref,
      () => ({
        open: () => {
          if (ready && linkToken && !loading) {
            console.log("🚀 Opening Plaid Link programmatically...")
            setLoading(true)
            setError(null)
            open()
          } else {
            console.warn("Plaid Link not ready for programmatic opening", { ready, linkToken, loading })
          }
        },
      }),
      [open, ready, linkToken, loading],
    )

    const handleClick = useCallback(() => {
      if (!ready || !linkToken) {
        console.warn("Plaid Link not ready yet")
        return
      }

      setLoading(true)
      setError(null)
      console.log("🚀 Opening Plaid Link...")
      open()
    }, [open, ready, linkToken])

    if (error) {
      return (
        <Button variant="outline" size={size} className={className} disabled>
          <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
          Connection Error
        </Button>
      )
    }

    return (
      <Button
        onClick={handleClick}
        disabled={!ready || loading || !linkToken}
        variant={variant}
        size={size}
        className={className}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : ready && linkToken ? (
          <Plus className="w-4 h-4 mr-2" />
        ) : (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        )}
        {children || (ready && linkToken ? "Connect Account" : "Loading...")}
      </Button>
    )
  },
)

PlaidLink.displayName = "PlaidLink"

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
            Securely link your brokerage accounts to see your complete portfolio in one beautiful dashboard. We're using
            Plaid's secure sandbox environment for testing.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 opacity-60">
          {[
            { name: "First Platypus Bank", desc: "Test Bank" },
            { name: "Tartan Bank", desc: "Investment" },
            { name: "Houndstooth Bank", desc: "Checking" },
            { name: "Sandbox Bank", desc: "All Types" },
          ].map((bank) => (
            <div key={bank.name} className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="w-8 h-8 bg-gray-200 rounded mx-auto mb-2 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-gray-400" />
              </div>
              <span className="text-xs text-gray-500 font-medium block">{bank.name}</span>
              <span className="text-xs text-gray-400">{bank.desc}</span>
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
            <span>Sandbox Environment</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span>Test Data Only</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
            <span>Secure Testing</span>
          </div>
        </div>

        {/* Test Credentials Info */}
        <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-2">🧪 Test Credentials</h3>
          <div className="text-sm text-blue-800 space-y-1">
            <p>
              <strong>Username:</strong> user_good
            </p>
            <p>
              <strong>Password:</strong> pass_good
            </p>
            <p className="text-xs text-blue-600 mt-2">Select any test bank and use these credentials to connect</p>
          </div>
        </div>
      </div>
    </div>
  )
}
