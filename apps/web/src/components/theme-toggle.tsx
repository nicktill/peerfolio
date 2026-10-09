"use client"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { AnimatedThemeToggler } from "@web/components/magicui/animated-theme-toggler"
import { buttonVariants } from "@web/components/ui/button"
import { cn } from "@web/lib/utils"

/**
 * Light/dark switch that wipes the new theme across the page from the button (Magic UI's Animated Theme
 * Toggler, using the View Transitions API where the browser has it). next-themes still owns the saved choice.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // The server can't know the resolved theme, so render a stable placeholder
  // until after hydration rather than guessing and flipping.
  useEffect(() => setMounted(true), [])

  const dark = mounted && resolvedTheme === "dark"

  return (
    <AnimatedThemeToggler
      theme={dark ? "dark" : "light"}
      onThemeChange={setTheme}
      duration={550}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "[&_svg]:size-4")}
      aria-label={mounted ? `Switch to ${dark ? "light" : "dark"} mode` : "Toggle theme"}
    />
  )
}
