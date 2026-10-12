"use client"

import { useEffect, useRef } from "react"
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react"
import { cn } from "@web/lib/utils"

/**
 * Tips toward the cursor with a soft light that follows it, so a card feels like a
 * physical object. Pass the card's own classes as `className`; the tilt, spring
 * and glow are added around it. Mouse only, and flat with reduced motion.
 */
export function TiltCard({
  className,
  style,
  max = 3,
  glow: tinted = false,
  glare = true,
  children,
}: {
  className?: string
  style?: React.CSSProperties
  /** Greatest tilt, in degrees. */
  max?: number
  /** Tint the cursor light with the accent colour instead of the neutral primary. */
  glow?: boolean
  /** The light that follows the cursor. Off for a pure physical tilt. */
  glare?: boolean
  children: React.ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const rotateX = useSpring(0, { stiffness: 170, damping: 19, mass: 0.7 })
  const rotateY = useSpring(0, { stiffness: 170, damping: 19, mass: 0.7 })
  const x = useMotionValue(-300)
  const y = useMotionValue(-300)
  const glow = `radial-gradient(circle, ${tinted ? "rgba(var(--accent-a), 0.24)" : "hsl(var(--primary) / 0.13)"}, transparent 70%)`

  const ref = useRef<HTMLDivElement>(null)
  // Sample pointer movement once per frame; cache geometry until layout changes.
  useEffect(() => {
    const el = ref.current
    if (!el || reduceMotion) return
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)")
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    let visible = false, hovering = false, dirty = true, raf = 0
    let rect: DOMRect | null = null
    let point: { x: number; y: number } | null = null
    const active = () => visible && !document.hidden && fine.matches && !reduced.matches
    const pause = () => {
      cancelAnimationFrame(raf); raf = 0
      rotateX.jump(0); rotateY.jump(0)
    }
    const frame = () => {
      raf = 0
      if (!active() || !point) return
      if (dirty || !rect) { rect = el.getBoundingClientRect(); dirty = false }
      if (!rect.width || !rect.height) return
      if (hovering) {
        const px = Math.max(-0.5, Math.min(0.5, (point.x - rect.left) / rect.width - 0.5))
        const py = Math.max(-0.5, Math.min(0.5, (point.y - rect.top) / rect.height - 0.5))
        rotateY.set(px * max * 1.7); rotateX.set(-py * max * 2.1)
        x.set(point.x - rect.left - 300); y.set(point.y - rect.top - 300)
      } else {
        const dx = Math.max(-1, Math.min(1, (point.x - rect.left - rect.width / 2) / (window.innerWidth / 2)))
        const dy = Math.max(-1, Math.min(1, (point.y - rect.top - rect.height / 2) / (window.innerHeight / 2)))
        rotateY.set(dx * max * 0.7); rotateX.set(-dy * max * 0.7)
      }
    }
    const schedule = () => { if (!raf && active() && point) raf = requestAnimationFrame(frame) }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !active()) return
      // Controls should remain steady while clicking or scrubbing a preview.
      if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea, [role=tab], [role=slider]")) {
        point = null
        cancelAnimationFrame(raf); raf = 0
        rotateX.set(0); rotateY.set(0)
        return
      }
      point = { x: event.clientX, y: event.clientY }; schedule()
    }
    const onEnter = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return
      hovering = true; dirty = true; onMove(event)
    }
    const onLeave = () => { hovering = false; point = null; cancelAnimationFrame(raf); raf = 0; rotateX.set(0); rotateY.set(0) }
    const invalidate = () => { dirty = true; schedule() }
    const onVisibility = () => { dirty = true; if (!active()) pause(); else schedule() }
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting; onVisibility()
    })
    const resize = new ResizeObserver(invalidate)
    io.observe(el); resize.observe(el)
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("scroll", invalidate, { passive: true, capture: true })
    window.addEventListener("resize", invalidate, { passive: true })
    el.addEventListener("pointerenter", onEnter); el.addEventListener("pointerleave", onLeave)
    document.addEventListener("visibilitychange", onVisibility)
    fine.addEventListener("change", onVisibility); reduced.addEventListener("change", onVisibility)
    return () => {
      pause(); io.disconnect(); resize.disconnect()
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("scroll", invalidate, true); window.removeEventListener("resize", invalidate)
      el.removeEventListener("pointerenter", onEnter); el.removeEventListener("pointerleave", onLeave)
      document.removeEventListener("visibilitychange", onVisibility)
      fine.removeEventListener("change", onVisibility); reduced.removeEventListener("change", onVisibility)
    }
  }, [reduceMotion, max, rotateX, rotateY, x, y])

  if (reduceMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      ref={ref}
      className={cn("group/tilt relative", className)}
      style={{ ...style, rotateX, rotateY, transformPerspective: 1200 }}

    >
      {children}
      {glare ? (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/tilt:opacity-100"
        style={{ overflow: "hidden" }}
      >
        <motion.span className="absolute left-0 top-0 size-[600px]" style={{ x, y, background: glow }} />
      </span>
      ) : null}
    </motion.div>
  )
}
