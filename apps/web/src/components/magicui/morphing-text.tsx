"use client"

import { useEffect, useState, useRef } from "react"
import { cn } from "@web/lib/utils"

interface MorphingTextProps {
  className?: string
  texts: string[]
  animationType?: "slide" | "typewriter" | "fade"
}

export const MorphingText: React.FC<MorphingTextProps> = ({ 
  texts, 
  className,
  animationType = "slide" 
}) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [displayText, setDisplayText] = useState(texts[0] || "")
  const [isVisible, setIsVisible] = useState(true)
  
  // Refs to store interval/timeout IDs for cleanup
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const eraseIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const typeIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const delayTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Cleanup function
  const cleanup = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (eraseIntervalRef.current) clearInterval(eraseIntervalRef.current)
    if (typeIntervalRef.current) clearInterval(typeIntervalRef.current)
    if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current)
    if (delayTimeoutRef.current) clearTimeout(delayTimeoutRef.current)
  }

  useEffect(() => {
    if (texts.length <= 1 || !isVisible) return

    // Cleanup any existing intervals
    cleanup()

    if (animationType === "typewriter") {
      // Reset to a clean state when restarting
      setDisplayText(texts[currentIndex])
      setIsAnimating(false)
      
      // Add a small delay before starting the animation
      delayTimeoutRef.current = setTimeout(() => {
        intervalRef.current = setInterval(() => {
          const currentText = texts[currentIndex]
          const nextIndex = (currentIndex + 1) % texts.length
          const nextText = texts[nextIndex]
          
          setIsAnimating(true)
          
          // Erase current text
          let eraseIndex = currentText.length
          eraseIntervalRef.current = setInterval(() => {
            if (eraseIndex > 0) {
              setDisplayText(currentText.substring(0, eraseIndex - 1))
              eraseIndex--
            } else {
              if (eraseIntervalRef.current) clearInterval(eraseIntervalRef.current)
              
              // Type new text
              let typeIndex = 0
              typeIntervalRef.current = setInterval(() => {
                if (typeIndex < nextText.length) {
                  setDisplayText(nextText.substring(0, typeIndex + 1))
                  typeIndex++
                } else {
                  if (typeIntervalRef.current) clearInterval(typeIntervalRef.current)
                  setCurrentIndex(nextIndex)
                  setIsAnimating(false)
                }
              }, 80) // Typing speed
            }
          }, 60) // Erasing speed
        }, 4000)
      }, 500) // Initial delay
      
    } else {
      // Slide or fade animation
      intervalRef.current = setInterval(() => {
        setIsAnimating(true)
        
        animationTimeoutRef.current = setTimeout(() => {
          setCurrentIndex((prev) => (prev + 1) % texts.length)
        }, 250)
        
        delayTimeoutRef.current = setTimeout(() => {
          setIsAnimating(false)
        }, 500)
      }, 3000)
    }

    return cleanup
  }, [texts.length, currentIndex, animationType, isVisible])

  // Update display text for non-typewriter animations
  useEffect(() => {
    if (animationType !== "typewriter") {
      setDisplayText(texts[currentIndex])
    }
  }, [currentIndex, animationType, texts])

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [])

  // Find the longest text to prevent layout shift
  const longestText = texts.reduce((a, b) => a.length > b.length ? a : b, "")

  const getAnimationClasses = () => {
    // Base classes that should be applied to all animations
    const baseClasses = cn("font-bold text-gray-900 transition-all", className)
    
    if (animationType === "typewriter") {
      return cn(
        baseClasses,
        "duration-200",
        "after:content-['|'] after:animate-pulse after:text-emerald-500 after:ml-1",
        isAnimating ? "after:opacity-100" : "after:opacity-0"
      )
    }
    
    if (animationType === "fade") {
      return cn(
        baseClasses,
        "duration-500 ease-out",
        isAnimating ? "opacity-0" : "opacity-100"
      )
    }
    
    // Default slide animation
    return cn(
      baseClasses,
      "duration-500 ease-out transform-gpu",
      isAnimating 
        ? "opacity-0 translate-y-[-20px] scale-95" 
        : "opacity-100 translate-y-0 scale-100"
    )
  }

  return (
    <span className={cn("relative inline-block", animationType !== "typewriter" && "overflow-hidden")}>
      {/* Invisible spacer to maintain consistent width */}
      <span className={cn("invisible font-bold", className)} aria-hidden="true">
        {animationType === "typewriter" ? longestText + "|" : longestText}
      </span>
      
      {/* Animated text */}
      <span className="absolute inset-0 flex items-center">
        <span 
          className={getAnimationClasses()}
          style={{
            transitionProperty: "opacity, transform",
            transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)"
          }}
        >
          {displayText}
        </span>
      </span>
      
      {/* Subtle highlight effect during transition (only for slide animation) */}
      {animationType === "slide" && (
        <span 
          className={cn(
            "absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-emerald-400/10 to-emerald-500/5",
            "transition-opacity duration-300 ease-out rounded-lg -mx-2 -my-1",
            isAnimating ? "opacity-100" : "opacity-0"
          )}
        />
      )}
      
      {/* Glow effect for typewriter */}
      {animationType === "typewriter" && (
        <span 
          className={cn(
            "absolute inset-0 bg-emerald-500/5 blur-xl rounded-lg -mx-4 -my-2",
            "transition-opacity duration-300 ease-out",
            isAnimating ? "opacity-100" : "opacity-0"
          )}
        />
      )}
    </span>
  )
}
