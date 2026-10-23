"use client"

import { useEffect } from "react"

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"
const AWAY_MS = 60_000 // only bother after the app has been backgrounded this long
const EVERY_MS = 30 * 60_000 // and every half hour while it stays open
const LAST = "pf-reloaded-for"

/**
 * An installed web app that sits suspended on a phone is resumed, not reloaded, so it can keep running an old
 * release for days. When the app comes back to the foreground (or every half hour while open) this asks the server
 * which deploy is live and reloads once if it isn't the one running. It never interrupts typing, and it reloads at
 * most once per new release, so a failing check can't loop. Local development has no version and does nothing.
 */
export function VersionWatcher() {
  useEffect(() => {
    if (BUILD === "dev") return
    let hiddenAt = 0
    let busy = false

    async function check() {
      if (busy) return
      busy = true
      try {
        const res = await fetch("/api/version", { cache: "no-store" })
        if (!res.ok) return
        const { id } = (await res.json()) as { id?: string }
        if (!id || id === "dev" || id === BUILD) return
        // Don't pull the page out from under someone who's typing; the next check will catch it.
        const el = document.activeElement as HTMLElement | null
        if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
        if (sessionStorage.getItem(LAST) === id) return
        sessionStorage.setItem(LAST, id)
        window.location.reload()
      } catch {
        /* offline or storage blocked: try again next time */
      } finally {
        busy = false
      }
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()
      } else if (hiddenAt && Date.now() - hiddenAt >= AWAY_MS) {
        hiddenAt = 0
        void check()
      }
    }

    document.addEventListener("visibilitychange", onVisibility)
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check()
    }, EVERY_MS)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.clearInterval(timer)
    }
  }, [])

  return null
}
