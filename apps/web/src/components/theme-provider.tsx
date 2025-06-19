"use client"
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react"

interface ThemeContextType {
  isDark: boolean
  toggleDark: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme")
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      const dark = stored === "dark" || (!stored && prefersDark)
      setIsDark(dark)
      document.documentElement.classList.toggle("dark", dark)
    }
  }, [])

  const toggleDark = () => {
    setIsDark((prev) => {
      const next = !prev
      if (typeof window !== "undefined") {
        document.documentElement.classList.toggle("dark", next)
        localStorage.setItem("theme", next ? "dark" : "light")
      }
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ isDark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
