"use client"

import { useState, useEffect } from "react"
import { cn } from "@web/lib/utils"

interface FadeTransitionProps {
  children: React.ReactNode
  isLoading: boolean
  duration?: number
  className?: string
}

export default function FadeTransition({ 
  children, 
  isLoading, 
  duration = 300,
  className 
}: FadeTransitionProps) {
  const [shouldRender, setShouldRender] = useState(isLoading)
  const [fadeClass, setFadeClass] = useState("opacity-0")

  useEffect(() => {
    if (!isLoading) {
      // Start fade in
      setFadeClass("opacity-0")
      setShouldRender(true)
      
      // Small delay to ensure DOM is ready, then fade in
      const timer = setTimeout(() => {
        setFadeClass("opacity-100")
      }, 50)
      
      return () => clearTimeout(timer)
    } else {
      // Fade out
      setFadeClass("opacity-0")
      const timer = setTimeout(() => {
        setShouldRender(false)
      }, duration)
      
      return () => clearTimeout(timer)
    }
  }, [isLoading, duration])

  if (!shouldRender) return null

  return (
    <div 
      className={cn(
        "transition-opacity ease-in-out",
        fadeClass,
        className
      )}
      style={{ transitionDuration: `${duration}ms` }}
    >
      {children}
    </div>
  )
}
