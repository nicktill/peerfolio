"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { getInflight, subscribeInflight } from "@web/lib/api-cache"
import { cn } from "@web/lib/utils"

/**
 * A slim bar across the top that appears when something is loading and
 * finishes with a quick sweep. It waits a moment first, so requests that come
 * back instantly (most of them, thanks to the cache) never flicker it.
 */
export function NavProgress() {
  const inflight = useSyncExternalStore(subscribeInflight, getInflight, () => 0)
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle")

  useEffect(() => {
    if (inflight > 0) {
      const timer = setTimeout(() => setPhase("loading"), 140)
      return () => clearTimeout(timer)
    }
    setPhase((p) => (p === "loading" ? "done" : "idle"))
  }, [inflight])

  useEffect(() => {
    if (phase !== "done") return
    const timer = setTimeout(() => setPhase("idle"), 600)
    return () => clearTimeout(timer)
  }, [phase])

  return <div aria-hidden className={cn("nav-progress", phase)} />
}
