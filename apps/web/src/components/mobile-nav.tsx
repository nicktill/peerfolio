"use client"

import { useState } from "react"
import { Menu, X, Home, BarChart3, Settings, LogOut } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { cn } from "@web/lib/utils"

interface MobileNavProps {
  className?: string
}

export function MobileNav({ className }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)

  const toggleNav = () => setIsOpen(!isOpen)

  const navItems = [
    { icon: Home, label: "Dashboard", href: "/dashboard" },
    { icon: BarChart3, label: "Portfolio", href: "/portfolio" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ]

  return (
    <>
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="sm"
        className={cn("md:hidden", className)}
        onClick={toggleNav}
        aria-label="Toggle navigation menu"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile Navigation Overlay */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={toggleNav} />

          {/* Navigation Panel */}
          <div className="fixed top-0 right-0 h-full w-64 bg-white dark:bg-gray-900 shadow-xl z-50 md:hidden transform transition-transform duration-300 ease-in-out">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold">Menu</h2>
                <Button variant="ghost" size="sm" onClick={toggleNav} aria-label="Close navigation menu">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Navigation Items */}
              <nav className="flex-1 p-4">
                <ul className="space-y-2">
                  {navItems.map((item) => (
                    <li key={item.label}>
                      <a
                        href={item.href}
                        className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        onClick={toggleNav}
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="font-medium">{item.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>

              {/* Footer */}
              <div className="p-4 border-t">
                <Button variant="ghost" className="w-full justify-start" onClick={toggleNav}>
                  <LogOut className="h-5 w-5 mr-3" />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
