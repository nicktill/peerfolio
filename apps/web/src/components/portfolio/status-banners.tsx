"use client"

import React from "react"
import { AlertTriangle, Info } from "lucide-react"

interface StatusBannersProps {
  isDemoMode: boolean
  hasConnectedAccounts: boolean
}

export function StatusBanners({ isDemoMode, hasConnectedAccounts }: StatusBannersProps) {
  return (
    <>
      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-blue-950/40 border border-blue-200 dark:border-blue-800/50 rounded-xl p-5 backdrop-blur-sm shadow-lg dark:shadow-blue-900/10 hover:shadow-xl transition-all duration-300">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-2">
                🎯 Demo Mode Active
                <span className="bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium px-2 py-1 rounded-full">
                  Demo Data
                </span>
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                This is a sample portfolio view to illustrate how your real investment accounts would appear while we await for approval from Plaid for real account connections.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plaid Sandbox Mode Banner */}
      {hasConnectedAccounts && !isDemoMode && (
        <div className="bg-gradient-to-r from-yellow-50 via-amber-50 to-orange-50 dark:from-yellow-950/40 dark:via-amber-950/30 dark:to-orange-950/40 border border-yellow-200 dark:border-yellow-800/50 rounded-xl p-5 backdrop-blur-sm shadow-lg dark:shadow-yellow-900/10 hover:shadow-xl transition-all duration-300">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/50 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2 flex items-center gap-2">
                🚧 MVP Phase - Plaid Sandbox Connection Active
                <span className="bg-yellow-100/80 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-xs font-medium px-2 py-1 rounded-full">
                  Sandbox Data
                </span>
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 leading-relaxed hidden xs:block">
                Peerfolio is currently in its MVP phase using Plaid's sandbox environment. We're awaiting approval to connect with real financial institutions. The platform demonstrates full functionality with sample data until we go live with real accounts.
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 leading-relaxed xs:hidden">
               Peerfolio is currently in its MVP phase using Plaid's sandbox environment. We're awaiting approval to connect with real financial institutions. The platform demonstrates full functionality with sample data until we go live with real accounts.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
