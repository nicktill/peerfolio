"use client"

import { useEffect, useState } from "react"
import { cn } from "@web/lib/utils"

interface MorphingTextProps {
  className?: string
  texts: string[]
}

export const MorphingText: React.FC<MorphingTextProps> = ({ texts, className }) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    if (texts.length <= 1) return

    const interval = setInterval(() => {
      // Fade out
      setIsVisible(false)
      
      // After fade out, change text and fade in
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % texts.length)
        setIsVisible(true)
      }, 300) // Half of transition duration
      
    }, 3000) // Change every 3 seconds

    return () => clearInterval(interval)
  }, [texts.length])

  // Find the longest text to prevent layout shift
  const longestText = texts.reduce((a, b) => a.length > b.length ? a : b, "")

  return (
    <span className={cn("relative inline-block", className)}>
      {/* Invisible spacer to maintain consistent width */}
      <span className="invisible font-bold" aria-hidden="true">
        {longestText}
      </span>
      {/* Visible text with fade transition */}
      <span 
        className={cn(
          "absolute inset-0 font-bold text-gray-900 transition-opacity duration-600 ease-in-out",
          isVisible ? "opacity-100" : "opacity-0"
        )}
      >
        {texts[currentIndex]}
      </span>
    </span>
  )
}
