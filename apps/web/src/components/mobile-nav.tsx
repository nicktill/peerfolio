"use client"

import { LogOut } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { signOut } from "next-auth/react"
import { getConnectedAccounts } from "@web/lib/account-storage"


interface MobileNavProps {
  className?: string
}

export function MobileNav({ className }: MobileNavProps) {
  const handleSignOut = () => {
    signOut({ callbackUrl: "/" })
  }

  const handleViewConnected = () => {
    const existingAccounts = getConnectedAccounts()
    if (existingAccounts.length === 0) {
      // Don't navigate to connected view, instead trigger Plaid connection
      // This prevents showing an empty connected accounts page
      return
    }
    // Only show connected accounts if they actually exist
  }

  return (
    <Button variant="ghost" size="sm" className={className} onClick={handleSignOut} aria-label="Sign out">
      <LogOut className="h-4 w-4 mr-2" />
      Sign Out
    </Button>
  )
}
