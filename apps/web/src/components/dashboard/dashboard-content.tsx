"use client"

import { useState } from "react"
import { EmptyState } from "./empty-state"
import { ConnectedDashboard } from "./connected-dashboard"

interface DashboardContentProps {
  session: any
  connectedAccounts: any[]
  setConnectedAccounts: (accounts: any[]) => void
}

export function DashboardContent({ 
  session, 
  connectedAccounts, 
  setConnectedAccounts 
}: DashboardContentProps) {
  const hasConnectedAccounts = connectedAccounts.length > 0

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {hasConnectedAccounts ? (
        <ConnectedDashboard 
          session={session}
          connectedAccounts={connectedAccounts}
          setConnectedAccounts={setConnectedAccounts}
        />
      ) : (
        <EmptyState 
          session={session}
          onAccountConnected={setConnectedAccounts}
        />
      )}
    </main>
  )
}
