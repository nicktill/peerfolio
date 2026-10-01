"use client"

import { useEffect, useRef } from "react"
import { fitCanvas, moodFromUrl, prefersStill, readTheme, strokeGrid, watchTheme, cursorOff } from "./canvas"

/**
 * DRAFT: topographic. Contour lines of a slowly shifting landscape drift over
 * the faint checker grid, like a survey map laid on graph paper. Every fifth
 * line is an index contour in brand green. The cursor raises a hill that the
 * lines flow around, and it settles back when the cursor leaves.
 *
 * The lines take the day's mood: gain green when you're up, loss red when
 * you're down, and the terrain drifts the same way (rising or sinking). It also
 * scrolls with the page at a slower rate, so the map feels laid under the content.
 *
 * Marching squares on a coarse field, only for the levels each cell crosses,
 * at 20fps: calm motion doesn't need more.
 */
const STEP = 12
const LEVEL = 0.2

export function TopoField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    let theme = readTheme()
    const up = moodFromUrl() === "up"
    let scroll = window.scrollY
    let size = fitCanvas(canvas, ctx)
    let nx = 0
    let ny = 0
    let field = new Float32Array(0)
    const hill = { x: -9999, y: -9999, amp: 0, targetAmp: 0, tx: -9999, ty: -9999 }

    const alloc = () => {
      size = fitCanvas(canvas, ctx)
      nx = Math.ceil(size.w / STEP) + 1
      ny = Math.ceil(size.h / STEP) + 1
      field = new Float32Array(nx * ny)
    }

    const sample = (t: number) => {
      const s = 0.0042
      for (let j = 0; j < ny; j++) {
        // Parallax with the page, plus a slow drift in the day's direction.
        const y = j * STEP + scroll * 0.35 + (up ? 1 : -1) * t * 140
        for (let i = 0; i < nx; i++) {
          const x = i * STEP
          // A few crossing waves at different scales read as terrain, and drift apart slowly.
          let v =
            Math.sin(x * s * 0.9 + t * 0.7) * 0.9 +
            Math.sin(y * s * 1.3 - t * 0.5) * 0.8 +
            Math.sin((x + y) * s * 0.55 + t * 0.4) * 0.7 +
            Math.sin((x * 0.8 - y * 1.1) * s * 1.9 - t * 0.9) * 0.35
          if (hill.amp > 0.01) {
            const dx = x - hill.x
            const dy = j * STEP - hill.y
            v += hill.amp * Math.exp(-(dx * dx + dy * dy) / (2 * 150 * 150))
          }
          field[j * nx + i] = v
        }
      }
    }

    const draw = () => {
      const { w, h } = size
      ctx.clearRect(0, 0, w, h)
      strokeGrid(ctx, w, h, theme.fg, theme.dark ? 0.05 : 0.045)

      const minor = new Path2D()
      const index = new Path2D()
      const lerp = (a: number, b: number, lv: number) => (lv - a) / (b - a)

      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const a = field[j * nx + i]!
          const b = field[j * nx + i + 1]!
          const c = field[(j + 1) * nx + i + 1]!
          const d = field[(j + 1) * nx + i]!
          const lo = Math.min(a, b, c, d)
          const hi = Math.max(a, b, c, d)
          const x0 = i * STEP
          const y0 = j * STEP
          for (let k = Math.ceil(lo / LEVEL); k * LEVEL <= hi; k++) {
            const lv = k * LEVEL
            const pts: [number, number][] = []
            if ((a < lv) !== (b < lv)) pts.push([x0 + lerp(a, b, lv) * STEP, y0])
            if ((b < lv) !== (c < lv)) pts.push([x0 + STEP, y0 + lerp(b, c, lv) * STEP])
            if ((d < lv) !== (c < lv)) pts.push([x0 + lerp(d, c, lv) * STEP, y0 + STEP])
            if ((a < lv) !== (d < lv)) pts.push([x0, y0 + lerp(a, d, lv) * STEP])
            const path = k % 5 === 0 ? index : minor
            for (let p = 0; p + 1 < pts.length; p += 2) {
              path.moveTo(pts[p]![0], pts[p]![1])
              path.lineTo(pts[p + 1]![0], pts[p + 1]![1])
            }
          }
        }
      }

      // Both line weights carry the mood colour, so light and dark read the same.
      const tone = up ? theme.gain : theme.loss
      ctx.lineWidth = 1
      ctx.globalAlpha = theme.dark ? 0.13 : 0.16
      ctx.strokeStyle = tone
      ctx.stroke(minor)
      ctx.lineWidth = 1.4
      ctx.globalAlpha = theme.dark ? 0.38 : 0.42
      ctx.stroke(index)
      ctx.globalAlpha = 1
    }

    alloc()
    if (prefersStill()) {
      sample(0)
      draw()
      const onResize = () => {
        alloc()
        sample(0)
        draw()
      }
      window.addEventListener("resize", onResize)
      return () => window.removeEventListener("resize", onResize)
    }

    let frame = 0
    let last = 0
    const start = performance.now()
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < 50) return
      last = now
      // The hill eases toward the cursor and rises or sinks gently.
      hill.x += (hill.tx - hill.x) * 0.15
      hill.y += (hill.ty - hill.y) * 0.15
      hill.amp += (hill.targetAmp - hill.amp) * 0.08
      sample((now - start) / 24000)
      draw()
    }

    const onMove = (e: PointerEvent) => {
      if (cursorOff()) return
      if (e.pointerType !== "mouse") return
      if (hill.amp < 0.05) {
        hill.x = e.clientX
        hill.y = e.clientY
      }
      hill.tx = e.clientX
      hill.ty = e.clientY
      hill.targetAmp = 1.6
    }
    const onLeave = () => (hill.targetAmp = 0)
    const onScroll = () => (scroll = window.scrollY)
    const stop = watchTheme(() => (theme = readTheme()))
    window.addEventListener("resize", alloc)
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("scroll", onScroll, { passive: true })
    document.addEventListener("pointerleave", onLeave)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      stop()
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", alloc)
      window.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerleave", onLeave)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className="grid-field pointer-events-none fixed inset-0 -z-10" />
}
