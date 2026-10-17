"use client"

import { createContext, createElement, useContext, useEffect, useState } from "react"
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

/** A server page that already decided (session + admin allowlist) hands the answer down here, so first paint is right and no fetch is needed. */
const ServerAnswer = createContext<boolean | null>(null)
export function SportsAccessProvider({ enabled, children }: { enabled: boolean | null; children: React.ReactNode }) {
  return createElement(ServerAnswer.Provider, { value: enabled }, children)
}

/**
 * Whether to show any Sports UI, or null while that is still unknown (admin mode, no server answer yet). Mode "1" is on
 * for everyone (build-time, as before) and off is off. In admin mode the client never guesses: a server page's answer
 * wins, otherwise it asks /api/sports/access, which decides from the server-side admin allowlist. Sample/demo views get false.
 */
export function useSportsAccess(): boolean | null {
  const mode = sportsMode()
  const fromServer = useContext(ServerAnswer)
  const [asked, setAsked] = useState<boolean | null>(mode === "admin" ? answer : null)
  useEffect(() => {
    if (mode !== "admin" || fromServer !== null) return
    if (sampleActive()) {
      setAsked(false)
      return
    }
    let live = true
    if (answer !== null) setAsked(answer)
    else void ask().then((value) => live && setAsked(value))
    return () => {
      live = false
    }
  }, [mode, fromServer])
  if (mode === "off") return false
  if (mode === "all") return true
  return fromServer !== null ? fromServer : asked === null ? null : asked && !sampleActive()
}

/** Whether to show any Sports UI (false while unknown). */
export function useSportsEnabled(): boolean {
  return useSportsAccess() === true
}
