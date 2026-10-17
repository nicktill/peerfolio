"use client"

import { useEffect, useState } from "react"
import { sportsMode } from "@web/lib/sports/flag"
import { sampleActive } from "@web/lib/sample/fixtures"

/** The server's answer for this page session (module scope: shared by every component, gone on a reload or sign-out navigation). */
let answer: boolean | null = null
let pending: Promise<boolean> | null = null

function ask(): Promise<boolean> {
  pending ??= fetch("/api/sports/access", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { enabled: false }))
    .then((b: { enabled?: unknown }) => (answer = b?.enabled === true))
    .catch(() => false)
    .finally(() => {
      pending = null
    })
  return pending
}

/**
 * Whether to show any Sports UI. Mode "1" is on for everyone (build-time, as before) and off is off. In admin mode the
 * client never guesses: it defaults to hidden and asks /api/sports/access, which decides from the server-side admin
 * allowlist. Sample/demo views and signed-out visitors get false there.
 */
export function useSportsEnabled(): boolean {
  const mode = sportsMode()
  const [enabled, setEnabled] = useState<boolean>(mode === "all" || (mode === "admin" && answer === true))
  useEffect(() => {
    if (mode !== "admin") return
    if (sampleActive()) {
      setEnabled(false)
      return
    }
    let live = true
    if (answer !== null) setEnabled(answer)
    else void ask().then((value) => live && setEnabled(value))
    return () => {
      live = false
    }
  }, [mode])
  if (mode === "off") return false
  if (mode === "all") return true
  return enabled && !sampleActive()
}
