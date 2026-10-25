"use client"

import Link from "next/link"
import { PauseCircle } from "lucide-react"
import { SPORTS_HOLD_MESSAGE, sportsOnHold } from "@web/lib/sports/maintenance"

/** The note shown wherever sports would normally be, while sports is on hold (lib/sports/maintenance.ts). */
export function SportsHoldNotice({ className }: { className?: string }) {
  return (
    <div role="status" className={`flex items-start gap-3 rounded-2xl border bg-card/80 p-4 text-sm text-muted-foreground ${className ?? ""}`}>
      <PauseCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>{SPORTS_HOLD_MESSAGE}</p>
    </div>
  )
}

/** A whole page in place of a sports screen while on hold. Its pollers never mount, so nothing reaches the database. */
export function SportsHoldPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sports is paused</h1>
      <SportsHoldNotice />
      <Link href="/fantasy" className="text-sm font-medium underline underline-offset-2">Back to Fantasy</Link>
    </div>
  )
}

/** Renders `children` normally, or SportsHoldPage while sports is on hold. Decided in the browser, so a prerendered page lifts on time. */
export function SportsHoldGate({ children }: { children: React.ReactNode }) {
  return sportsOnHold() ? <SportsHoldPage /> : <>{children}</>
}
