"use client"

import { useEffect, useRef } from "react"
import { fitCanvas, hexRgb, moodFromUrl, prefersStill, readTheme, watchTheme } from "./canvas"

/**
 * DRAFT: a field of tiny market glyphs ($ % + − ▲ ▼ digits) lit from behind
 * by slow colour blooms, like light shining through a printed ticker sheet.
 * Glyphs in the light glow in the bloom's colour and shimmer as they re-print;
 * glyphs outside it stay a faint grey texture. The palette follows the day
 * (greens and blues up, reds and violets down), the cursor carries a lamp
 * that scrambles the glyphs it passes, and the blooms scroll with the page.
 *
 * Fast path: glyphs are stamped from a pre-rendered white atlas, then coloured
 * in one pass by stretching a tiny colour map over them ("source-in"), and the
 * same map, blurred, is laid underneath as the haze.
 */
const PITCH = 15
const GLYPHS = "0123456789$%+-.,:#=*/<>()▲▼"

type Bloom = { ax: number; ay: number; px: number; py: number; ph: number; r: number; rgb: [number, number, number] }

export function GlyphField() {
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

    // Atlas: every glyph once, in white, at device resolution.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const atlas = document.createElement("canvas")
    const actx = atlas.getContext("2d")!
    const makeAtlas = () => {
      atlas.width = GLYPHS.length * PITCH * dpr
      atlas.height = PITCH * dpr
      actx.setTransform(dpr, 0, 0, dpr, 0, 0)
      actx.clearRect(0, 0, atlas.width, atlas.height)
      actx.fillStyle = "#fff"
      actx.font = `500 11px ${theme.mono}`
      actx.textAlign = "center"
      actx.textBaseline = "middle"
      for (let i = 0; i < GLYPHS.length; i++) actx.fillText(GLYPHS[i]!, i * PITCH + PITCH / 2, PITCH / 2 + 0.5)
    }
    makeAtlas()

    // The colour map: one pixel per glyph cell.
    const map = document.createElement("canvas")
    const mctx = map.getContext("2d")!
    let cols = 0
    let rows = 0
    let cells = new Uint8Array(0)
    let image: ImageData | null = null
    const alloc = () => {
      size = fitCanvas(canvas, ctx)
      cols = Math.ceil(size.w / PITCH)
      rows = Math.ceil(size.h / PITCH)
      map.width = cols
      map.height = rows
      image = mctx.createImageData(cols, rows)
      cells = new Uint8Array(cols * rows)
      for (let i = 0; i < cells.length; i++) cells[i] = Math.floor(Math.random() * GLYPHS.length)
    }
    alloc()

    const palette = () => {
      const css = getComputedStyle(document.documentElement)
      const v = (n: string) => hexRgb(css.getPropertyValue(n).trim() || "#888888")
      return up ? [v("--gain"), v("--series-1"), v("--series-7")] : [v("--loss"), v("--series-7"), v("--series-5")]
    }
    let colors = palette()
    const blooms: Bloom[] = colors.map((rgb, i) => ({
      ax: [0.32, 0.38, 0.28][i]!,
      ay: [0.22, 0.3, 0.26][i]!,
      px: 46 + i * 19,
      py: 63 + i * 11,
      ph: i * 2.1,
      r: [0.26, 0.2, 0.17][i]!,
      rgb,
    }))
    const grey = () => (theme.dark ? [150, 150, 145] : [90, 90, 85])

    const frame = (t: number, shimmer: boolean) => {
      const { w, h } = size
      const diag = Math.hypot(w, h)
      const shift = scroll * 0.3
      const centres = blooms.map((b) => ({
        x: w * (0.55 + b.ax * Math.sin((t / b.px) * 2 * Math.PI + b.ph)),
        y: h * (0.45 + b.ay * Math.sin((t / b.py) * 2 * Math.PI + b.ph * 1.3)) - shift,
        r2: (b.r * diag) ** 2,
        rgb: b.rgb,
      }))
      const [gr, gg, gb] = grey()
      const data = image!.data
      const base = theme.dark ? 0.1 : 0.09
      const lit = theme.dark ? 0.75 : 0.5

      ctx.clearRect(0, 0, w, h)
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * PITCH + PITCH / 2
          const y = row * PITCH + PITCH / 2
          let wsum = 0
          let r = 0
          let g = 0
          let b = 0
          for (const c of centres) {
            const dx = x - c.x
            const dy = y - c.y
            const wt = Math.exp(-(dx * dx + dy * dy) / c.r2)
            wsum += wt
            r += c.rgb[0] * wt
            g += c.rgb[1] * wt
            b += c.rgb[2] * wt
          }
          let lampW = 0
          if (lamp.s > 0.01) {
            const dx = x - lamp.x
            const dy = y - lamp.y
            lampW = lamp.s * Math.exp(-(dx * dx + dy * dy) / (130 * 130))
          }
          const i = row * cols + col
          const k = Math.min(1, wsum + lampW * 0.8)
          // Colour: the bloom's hue where lit, fading to quiet grey where it isn't.
          const mix = Math.min(1, k * 1.4)
          const cr = wsum > 0.001 ? r / wsum : gr
          const cg = wsum > 0.001 ? g / wsum : gg
          const cb = wsum > 0.001 ? b / wsum : gb
          data[i * 4] = gr + (cr - gr) * mix
          data[i * 4 + 1] = gg + (cg - gg) * mix
          data[i * 4 + 2] = gb + (cb - gb) * mix
          data[i * 4 + 3] = Math.round(k * 255)

          // Glyphs re-print where the light is, faster under the lamp.
          if (shimmer && Math.random() < k * 0.025 + lampW * 0.25) cells[i] = Math.floor(Math.random() * GLYPHS.length)
          ctx.globalAlpha = base + k * k * lit
          const gIdx = cells[i]!
          ctx.drawImage(atlas, gIdx * PITCH * dpr, 0, PITCH * dpr, PITCH * dpr, col * PITCH, row * PITCH, PITCH, PITCH)
        }
      }
      mctx.putImageData(image!, 0, 0)

      // Colour the white glyphs in one pass, then lay the blurred map beneath as haze.
      ctx.globalAlpha = 1
      ctx.imageSmoothingEnabled = true
      ctx.globalCompositeOperation = "source-in"
      ctx.drawImage(map, 0, 0, cols, rows, 0, 0, cols * PITCH, rows * PITCH)
      ctx.globalCompositeOperation = "destination-over"
      ctx.globalAlpha = theme.dark ? 0.24 : 0.1
      ctx.drawImage(map, 0, 0, cols, rows, 0, 0, cols * PITCH, rows * PITCH)
      ctx.globalCompositeOperation = "source-over"
      ctx.globalAlpha = 1
    }

    if (prefersStill()) {
      frame(20, false)
      return () => undefined
    }

    let raf = 0
    let last = 0
    const start = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - last < 50) return
      last = now
      lamp.x += (lamp.tx - lamp.x) * 0.2
      lamp.y += (lamp.ty - lamp.y) * 0.2
      lamp.s += (lamp.ts - lamp.s) * 0.08
      frame((now - start) / 1000, true)
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
    const stop = watchTheme(() => {
      theme = readTheme()
      colors = palette()
      blooms.forEach((b, i) => (b.rgb = colors[i]!))
      makeAtlas()
    })
    window.addEventListener("resize", alloc)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("pointermove", onMove, { passive: true })
    document.addEventListener("pointerleave", onLeave)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      stop()
      window.removeEventListener("resize", alloc)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerleave", onLeave)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className="bg-gutters pointer-events-none fixed inset-0 -z-10" />
}
