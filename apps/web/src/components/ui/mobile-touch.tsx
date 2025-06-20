"use client"

import type React from "react"

import { cn } from "../../lib/utils"
import { forwardRef } from "react"

interface TouchableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
  disabled?: boolean
}

export const Touchable = forwardRef<HTMLDivElement, TouchableProps>(
  ({ children, className, disabled, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          // Base touch styles
          "touch-manipulation select-none",
          // Minimum touch target size (44px)
          "min-h-[44px] min-w-[44px]",
          // Active state feedback
          "active:scale-95 transition-transform duration-75",
          // Disabled state
          disabled && "pointer-events-none opacity-50",
          // Focus styles for accessibility
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)

Touchable.displayName = "Touchable"

interface MobileButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  variant?: "primary" | "secondary" | "ghost"
  size?: "sm" | "md" | "lg"
}

export const MobileButton = forwardRef<HTMLButtonElement, MobileButtonProps>(
  ({ children, className, variant = "primary", size = "md", ...props }, ref) => {
    const baseStyles =
      "touch-manipulation select-none font-medium rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:scale-95"

    const variants = {
      primary: "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800",
      secondary:
        "bg-gray-200 text-gray-900 hover:bg-gray-300 active:bg-gray-400 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600",
      ghost:
        "text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800 dark:active:bg-gray-700",
    }

    const sizes = {
      sm: "px-3 py-2 text-sm min-h-[36px]",
      md: "px-4 py-3 text-base min-h-[44px]",
      lg: "px-6 py-4 text-lg min-h-[52px]",
    }

    return (
      <button ref={ref} className={cn(baseStyles, variants[variant], sizes[size], className)} {...props}>
        {children}
      </button>
    )
  },
)

MobileButton.displayName = "MobileButton"

// Mobile-specific card component with proper touch interactions
interface MobileCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  pressable?: boolean
  className?: string
}

export const MobileCard = forwardRef<HTMLDivElement, MobileCardProps>(
  ({ children, pressable = false, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm",
          pressable && [
            "touch-manipulation cursor-pointer",
            "hover:shadow-md active:shadow-lg",
            "active:scale-[0.98] transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
          ],
          className,
        )}
        tabIndex={pressable ? 0 : undefined}
        role={pressable ? "button" : undefined}
        {...props}
      >
        {children}
      </div>
    )
  },
)

MobileCard.displayName = "MobileCard"
