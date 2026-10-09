"use client"

import { SessionProvider } from "next-auth/react"
import { MotionConfig } from "motion/react"
import { ThemeProvider } from "next-themes"
import { ConfirmProvider } from "@web/components/ui/confirm"
import { ToastProvider } from "@web/components/ui/toast"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/*
        next-themes injects a blocking script before paint, which is what stops
        the light-then-dark flash the old useEffect-based provider caused.
      */}
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {/* Every Motion animation honours the visitor's reduced-motion setting from here. */}
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </MotionConfig>
      </ThemeProvider>
    </SessionProvider>
  )
}
