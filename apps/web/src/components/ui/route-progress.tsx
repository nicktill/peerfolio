"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"

/**
 * A thin bar across the top while a page change loads, so a click answers immediately instead of
 * the screen sitting still. It starts on a click to an internal link and finishes when the path
 * changes (or after a few seconds, so it can't hang). Hidden with reduced motion.
 */
export function RouteProgress() {
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle")
  const current = useRef(pathname)
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin || url.pathname === current.current) return
      setPhase("loading")
      if (fallback.current) clearTimeout(fallback.current)
      fallback.current = setTimeout(() => setPhase("done"), 8000)
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])

  useEffect(() => {
    current.current = pathname
    if (fallback.current) clearTimeout(fallback.current)
    setPhase((p) => (p === "loading" ? "done" : p))
  }, [pathname])

  useEffect(() => {
    if (phase !== "done") return
    const id = setTimeout(() => setPhase("idle"), 450)
    return () => clearTimeout(id)
  }, [phase])

  if (reduceMotion || phase === "idle") return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px]">
      <motion.div
        className="h-full origin-left rounded-r-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.7)]"
        initial={{ scaleX: 0, opacity: 1 }}
        animate={phase === "loading" ? { scaleX: 0.82, opacity: 1 } : { scaleX: 1, opacity: 0 }}
        transition={phase === "loading" ? { duration: 6, ease: [0.1, 0.7, 0.2, 1] } : { duration: 0.35, ease: "easeOut" }}
      />
    </div>
  )
}
