"use client"

import { useEffect, useRef } from "react"
import { CELL, fitCanvas, gridOffsetX, hexRgb, moodFromUrl, prefersStill, readTheme, strokeGrid, watchTheme } from "./canvas"

/**
 * DRAFT: a slow aurora seen through the checker grid, as if each cell were a
 * pane of tinted glass. Soft colour fields drift on minute-long paths; every
 * cell takes the blend at its centre, so the gradient arrives as a mosaic. The
 * palette follows the day (greens, teals and blues up; reds, ambers and violets
 * down), the cursor carries a small lamp of brand light, and the fields scroll
 * with the page at a slower rate.
 */
type Field = { ax: number; ay: number; px: number; py: number; ph: number; r: number; rgb: [number, number, number] }

export function MosaicField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const up = moodFromUrl() === "up"
    let theme = readTheme()
    let size = fitCanvas(canvas, ctx)
    let scroll = window.scrollY
    const lamp = { x: -999, y: -999, tx: -999, ty: -999, s: 0, ts: 0 }

    const palette = () => {
      const css = getComputedStyle(document.documentElement)
      const v = (n: string) => hexRgb(css.getPropertyValue(n).trim() || "#888888")
      return up ? [v("--gain"), v("--series-1"), v("--series-3"), v("--series-7")] : [v("--loss"), v("--series-2"), v("--series-5"), v("--series-7")]
    }
    let colors = palette()
    const fields: Field[] = colors.map((rgb, i) => ({
      ax: 0.35 + 0.1 * i,
      ay: 0.3 + 0.05 * i,
      px: 52 + i * 17, // seconds per loop: slow enough to feel still at a glance
      py: 71 + i * 13,
      ph: i * 1.7,
      r: 0.17 + (i % 2) * 0.06,
      rgb,
    }))
    const brand = () => {
      const [h, s, l] = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim().split(/\s+/).map(parseFloat)
      // hsl -> rgb for the lamp
      const a = ((s ?? 50) / 100) * Math.min((l ?? 40) / 100, 1 - (l ?? 40) / 100)
      const f = (n: number) => {
        const k = (n + (h ?? 160) / 30) % 12
        return Math.round(255 * ((l ?? 40) / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      }
      return [f(0), f(8), f(4)] as [number, number, number]
    }
    let lampRgb = brand()

    const draw = (t: number) => {
      const { w, h } = size
      const ox = gridOffsetX(w)
      ctx.clearRect(0, 0, w, h)
      const cols = Math.ceil((w - ox) / CELL)
      const rows = Math.ceil(h / CELL) + 1
      const diag = Math.hypot(w, h)
      const peak = theme.dark ? 0.13 : 0.12
      const shift = (scroll * 0.3) % (h * 4)

      const centres = fields.map((f) => ({
        x: w * (0.5 + f.ax * Math.sin((t / f.px) * 2 * Math.PI + f.ph)),
        y: h * (0.5 + f.ay * Math.sin((t / f.py) * 2 * Math.PI + f.ph * 1.3)) - shift,
        r2: (f.r * diag) ** 2,
        rgb: f.rgb,
      }))

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cx = ox + col * CELL + CELL / 2
          const cy = row * CELL + CELL / 2
          let wsum = 0
          let r = 0
          let g = 0
          let b = 0
          for (const c of centres) {
            const dx = cx - c.x
            const dy = cy - c.y
            const wt = Math.exp(-(dx * dx + dy * dy) / c.r2)
            wsum += wt
            r += c.rgb[0] * wt
            g += c.rgb[1] * wt
            b += c.rgb[2] * wt
          }
          if (lamp.s > 0.01) {
            const dx = cx - lamp.x
            const dy = cy - lamp.y
            const wt = lamp.s * 1.4 * Math.exp(-(dx * dx + dy * dy) / (170 * 170))
            wsum += wt
            r += lampRgb[0] * wt
            g += lampRgb[1] * wt
            b += lampRgb[2] * wt
          }
          if (wsum < 0.02) continue
          // Separate blooms with quiet glass between them, not a wash over everything.
          ctx.globalAlpha = Math.pow(Math.min(1, wsum), 1.6) * peak
          ctx.fillStyle = `rgb(${Math.round(r / wsum)}, ${Math.round(g / wsum)}, ${Math.round(b / wsum)})`
          ctx.fillRect(ox + col * CELL + 2, row * CELL + 2, CELL - 3, CELL - 3)
        }
      }
      strokeGrid(ctx, w, h, theme.fg, theme.dark ? 0.065 : 0.06)
      ctx.globalAlpha = 1
    }

    if (prefersStill()) {
      draw(20)
      return () => undefined
    }

    let frame = 0
    let last = 0
    const start = performance.now()
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < 50) return
      last = now
      lamp.x += (lamp.tx - lamp.x) * 0.18
      lamp.y += (lamp.ty - lamp.y) * 0.18
      lamp.s += (lamp.ts - lamp.s) * 0.08
      draw((now - start) / 1000)
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      if (lamp.s < 0.05) {
        lamp.x = e.clientX
        lamp.y = e.clientY
      }
      lamp.tx = e.clientX
      lamp.ty = e.clientY
      lamp.ts = 1
    }
    const onLeave = () => (lamp.ts = 0)
    const onScroll = () => (scroll = window.scrollY)
    const onResize = () => (size = fitCanvas(canvas, ctx))
    const stop = watchTheme(() => {
      theme = readTheme()
      colors = palette()
      fields.forEach((f, i) => (f.rgb = colors[i]!))
      lampRgb = brand()
    })
    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("pointermove", onMove, { passive: true })
    document.addEventListener("pointerleave", onLeave)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      stop()
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerleave", onLeave)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className="grid-field pointer-events-none fixed inset-0 -z-10" />
}
