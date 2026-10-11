"use client"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { AnimatedThemeToggler } from "@web/components/magicui/animated-theme-toggler"
import { buttonVariants } from "@web/components/ui/button"
import { cn } from "@web/lib/utils"

/**
 * Light/dark switch. The icon form wipes the new theme across the page from the button (Magic UI's Animated
 * Theme Toggler, using the View Transitions API where the browser has it); the segmented form cross-fades
 * colours. next-themes still owns the saved choice.
 */
export function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "segmented" }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Colours cross-fade for a moment instead of snapping; the class is removed again so nothing else is ever animated.
  function change(theme: "light" | "dark") {
    const root = document.documentElement
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.add("pf-theme-fade")
      window.setTimeout(() => root.classList.remove("pf-theme-fade"), 300)
    }
    setTheme(theme)
  }

  // The server can't know the resolved theme, so render a stable placeholder
  // until after hydration rather than guessing and flipping.
  useEffect(() => setMounted(true), [])

  const dark = mounted && resolvedTheme === "dark"

  if (variant === "segmented") {
    return (
      <div className="peerfolio-theme" role="group" aria-label="Theme">
        <span className="th" aria-hidden />
        <button type="button" data-t="light" aria-pressed={mounted ? resolvedTheme !== "dark" : undefined} onClick={() => change("light")}>
          <Sun aria-hidden />Light
        </button>
        <button type="button" data-t="dark" aria-pressed={mounted ? resolvedTheme === "dark" : undefined} onClick={() => change("dark")}>
          <Moon aria-hidden />Dark
        </button>
      </div>
    )
  }

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
