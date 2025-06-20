"use client"

import { LogOut } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { signOut } from "next-auth/react"

interface MobileNavProps {
  className?: string
}

export function MobileNav({ className }: MobileNavProps) {
  const handleSignOut = () => {
    signOut({ callbackUrl: "/" })
  }

  return (
    <Button variant="ghost" size="sm" className={className} onClick={handleSignOut} aria-label="Sign out">
      <LogOut className="h-4 w-4 mr-2" />
      Sign Out
    </Button>
  )
}
