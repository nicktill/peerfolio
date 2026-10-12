"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import "./boot-screen.css"

const KEY = "pf-boot-shown"
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
const MIN_MS = 350
const MAX_MS = 2500
const DURATION = 900

// Runs before first paint: skip the overlay entirely when already shown this tab session.
const GUARD = `try{if(/[?&]boot=1/.test(location.search))sessionStorage.removeItem("${KEY}");if(sessionStorage.getItem("${KEY}"))document.documentElement.setAttribute("data-boot","done")}catch(e){}`

function findTarget(): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>("[data-brand-logo]")
  for (const el of all) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

export function BootScreen() {
  const { status } = useSession()
  const [gone, setGone] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLImageElement>(null)
  const inkRef = useRef<HTMLImageElement>(null)
  const ready = status !== "loading"
  const readyRef = useRef(ready)
  readyRef.current = ready

  useEffect(() => {
    const root = rootRef.current
    const logo = logoRef.current
    const html = document.documentElement
    if (!root || !logo || html.getAttribute("data-boot") === "done") {
      setGone(true)
      return
    }
    try { sessionStorage.setItem(KEY, "1") } catch {}

    const start = performance.now()
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let finished = false
    let raf = 0
    let target: HTMLElement | null = null
    let prevVis = ""

    const finish = () => {
      if (finished) return
      finished = true
      cancelAnimationFrame(raf)
      if (target) target.style.visibility = prevVis
      html.setAttribute("data-boot", "done")
      setGone(true)
    }

    const run = () => {
      if (finished) return
      target = findTarget()
      const from = logo.getBoundingClientRect()
      if (reduce || !target) {
        const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduce ? 200 : 350, easing: "ease-out", fill: "forwards" })
        a.onfinish = finish
        return
      }
      const to = target.getBoundingClientRect()
      prevVis = target.style.visibility
      target.style.visibility = "hidden"
      const s = to.width / from.width
      const dx = to.left - from.left
      const dy = to.top - from.top
      // Logo is laid out at its center spot; transform-origin 0 0 so translate+scale lands exactly.
      logo.style.animation = "none"
      const move = logo.animate(
        [{ transform: "translate(0,0) scale(1)" }, { transform: `translate(${dx}px,${dy}px) scale(${s})` }],
        { duration: DURATION, easing: EASE, fill: "forwards" },
      )
      const fade = root.animate([{ backgroundColor: "#000" }, { backgroundColor: "rgba(0,0,0,0)" }], {
        duration: DURATION * 0.8, delay: DURATION * 0.1, easing: EASE, fill: "forwards",
      })
      void fade
      const ink = inkRef.current
      if (ink && !html.classList.contains("dark")) {
        const opts = { duration: DURATION * 0.6, delay: DURATION * 0.1, easing: "ease-out", fill: "forwards" as const }
        logo.animate([{ opacity: 1 }, { opacity: 0 }], opts)
        ink.animate([{ transform: "translate(0,0) scale(1)", opacity: 0 }, { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 1 }], { ...opts, duration: DURATION, easing: EASE, fill: "forwards" })
      }
      move.onfinish = finish
    }

    const tick = () => {
      if (finished) return
      const elapsed = performance.now() - start
      const loaded = document.readyState === "complete"
      if ((readyRef.current && loaded && elapsed >= MIN_MS) || elapsed >= MAX_MS) {
        run()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return finish
  }, [])

  if (gone) return null
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: GUARD }} />
      <noscript><style>{".pf-boot{display:none!important}"}</style></noscript>
      <div ref={rootRef} className="pf-boot" aria-hidden="true">
        <Image ref={logoRef} src="/logo.png" alt="" width={56} height={56} priority className="pf-boot-logo" draggable={false} />
        <Image ref={inkRef} src="/logo.png" alt="" width={56} height={56} className="pf-boot-logo pf-boot-ink" draggable={false} />
      </div>
    </>
  )
}
