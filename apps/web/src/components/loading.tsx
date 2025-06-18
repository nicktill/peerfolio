"use client"

import Image from "next/image"
import { cn } from "@web/lib/utils"

interface LoadingProps {
  variant?: "skeleton" | "branded" | "minimal" | "pulse"
  className?: string
  isExiting?: boolean
}

export default function Loading({ variant = "branded", className, isExiting = false }: LoadingProps) {
  const baseClasses = cn(
    "transition-opacity duration-300 ease-in-out",
    isExiting ? "opacity-0" : "opacity-100",
    className
  )
  if (variant === "skeleton") {
    // Skeleton loader - shows layout structure while loading
    return (
      <div className={cn("min-h-screen bg-gray-50", baseClasses)}>
        {/* Header skeleton */}
        <div className="border-b border-gray-200 bg-white">
          <div className="container flex h-16 items-center justify-between px-6 max-w-6xl mx-auto">
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="h-8 w-16 bg-gray-200 rounded-full animate-pulse"></div>
              <div className="h-8 w-24 bg-gray-200 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
        
        {/* Main skeleton */}
        <div className="container max-w-6xl mx-auto px-6 py-24">
          <div className="text-center space-y-8">
            <div className="space-y-4">
              <div className="h-12 w-96 bg-gray-200 rounded mx-auto animate-pulse"></div>
              <div className="h-6 w-64 bg-gray-200 rounded mx-auto animate-pulse"></div>
              <div className="h-6 w-48 bg-gray-200 rounded mx-auto animate-pulse"></div>
            </div>
            <div className="flex justify-center space-x-4">
              <div className="h-12 w-32 bg-gray-200 rounded-full animate-pulse"></div>
              <div className="h-12 w-24 bg-gray-200 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (variant === "branded") {
    // Branded loading - shows your logo and brand colors
    return (
      <div className={cn("min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-emerald-50/20", baseClasses)}>
        <div className="text-center space-y-8">
          {/* Logo with pulse animation */}
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20"></div>
            <div className="relative bg-white rounded-full p-6 shadow-lg">
              <Image
                src="/logo.png"
                alt="Peerfolio"
                width={60}
                height={60}
                className="mx-auto"
              />
            </div>
          </div>
          
          {/* Brand name with animated text */}
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-gray-900">
              Peerfolio
            </h1>
            <p className="text-gray-500 animate-pulse">Loading your portfolio...</p>
          </div>
          
          {/* Progress bar */}
          <div className="w-64 mx-auto">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full animate-progress"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (variant === "minimal") {
    // Minimal - clean and fast
    return (
      <div className={cn("min-h-screen flex items-center justify-center bg-white", baseClasses)}>
        <div className="text-center">
          <div className="relative w-8 h-8 mx-auto mb-4">
            <div className="absolute top-0 left-0 w-full h-full border-2 border-gray-200 rounded-full"></div>
            <div className="absolute top-0 left-0 w-full h-full border-2 border-emerald-600 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-sm text-gray-500 font-medium">Loading</p>
        </div>
      </div>
    )
  }

  if (variant === "pulse") {
    // Pulse animation - modern and smooth
    return (
      <div className={cn("min-h-screen flex items-center justify-center bg-gray-50", baseClasses)}>
        <div className="text-center space-y-6">
          <div className="relative">
            {/* Multiple pulse rings */}
            <div className="absolute inset-0 w-16 h-16 bg-emerald-500 rounded-full animate-ping opacity-20"></div>
            <div className="absolute inset-2 w-12 h-12 bg-emerald-500 rounded-full animate-ping opacity-40 animation-delay-75"></div>
            <div className="relative w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">Getting things ready</h3>
            <p className="text-sm text-gray-500">This won't take long...</p>
          </div>
        </div>
      </div>
    )
  }

  // Default fallback
  return (
    <div className={cn("min-h-screen flex items-center justify-center bg-gray-50", className)}>
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
    </div>
  )
}
