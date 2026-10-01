"use client"

import { useEffect, useRef } from "react"
import { fitCanvas, hexRgb, moodFromUrl, prefersStill, readTheme, watchTheme, cursorOff } from "./canvas"

/**
 * DRAFT: a field of tiny market glyphs lit from behind by slow colour blooms,
 * like light coming through a printed ticker sheet.
 *
 * The light shades the type, the way ASCII art does: where it's dim the sheet
 * shows only fine marks (. : ,), where it's bright the glyphs get denser
 * (+ = %), and at the hot cores they are the heaviest ($ # ▲), glowing almost
 * white in the dark theme and deeply saturated in the light one. Glyphs in the
 * light keep re-printing, every few seconds a scan band sweeps down the sheet
 * and refreshes it like a quote board, and the cursor carries a lamp that
 * scrambles what it passes. Palette follows the day: greens and blues up,
 * reds and violets down.
 *
 * Fast path: glyphs are stamped from a pre-rendered white atlas, coloured in
 * one pass by stretching a tiny colour map over them ("source-in"), and a
 * blurrier copy of that map is laid underneath as the haze.
 */
const PITCH = 14
// Ordered light to heavy; the light level picks a band of this ramp.
const RAMP = [".,:'", "-+:=;", "+=*%<>/", "%$#▲▼&@"]
const ALL = RAMP.join("")

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

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const atlas = document.createElement("canvas")
    const actx = atlas.getContext("2d")!
    const makeAtlas = () => {
      atlas.width = ALL.length * PITCH * dpr
      atlas.height = PITCH * dpr
      actx.setTransform(dpr, 0, 0, dpr, 0, 0)
      actx.clearRect(0, 0, atlas.width, atlas.height)
      actx.fillStyle = "#fff"
      actx.font = `600 10.5px ${theme.mono}`
      actx.textAlign = "center"
      actx.textBaseline = "middle"
      for (let i = 0; i < ALL.length; i++) actx.fillText(ALL[i]!, i * PITCH + PITCH / 2, PITCH / 2 + 0.5)
    }
    makeAtlas()
    const bandStart = RAMP.map((_, b) => RAMP.slice(0, b).join("").length)
    const pick = (band: number) => bandStart[band]! + Math.floor(Math.random() * RAMP[band]!.length)

    // Colour map at glyph resolution, plus a quarter-size copy for the haze.
    const map = document.createElement("canvas")
    const mctx = map.getContext("2d")!
    const haze = document.createElement("canvas")
    const hctx = haze.getContext("2d")!
    let cols = 0
    let rows = 0
    let glyph = new Uint8Array(0)
    let band = new Uint8Array(0)
    let image: ImageData | null = null
    const alloc = () => {
      size = fitCanvas(canvas, ctx)
      cols = Math.ceil(size.w / PITCH)
      rows = Math.ceil(size.h / PITCH)
      map.width = cols
      map.height = rows
      haze.width = Math.max(1, Math.ceil(cols / 5))
      haze.height = Math.max(1, Math.ceil(rows / 5))
      image = mctx.createImageData(cols, rows)
      glyph = new Uint8Array(cols * rows)
      band = new Uint8Array(cols * rows)
      for (let i = 0; i < glyph.length; i++) glyph[i] = pick(0)
    }
    alloc()

    const palette = () => {
      const css = getComputedStyle(document.documentElement)
      const v = (n: string) => hexRgb(css.getPropertyValue(n).trim() || "#888888")
      return up ? [v("--gain"), v("--series-1"), v("--series-7")] : [v("--loss"), v("--series-7"), v("--series-5")]
    }
    let colors = palette()
    const blooms: Bloom[] = colors.map((rgb, i) => ({
      ax: [0.3, 0.36, 0.26][i]!,
      ay: [0.22, 0.28, 0.24][i]!,
      px: 48 + i * 19,
      py: 66 + i * 11,
      ph: i * 2.1,
      r: [0.24, 0.19, 0.16][i]!,
      rgb,
    }))

    const frame = (t: number, live: boolean) => {
      const { w, h } = size
      const dark = theme.dark
      const diag = Math.hypot(w, h)
      const shift = scroll * 0.3
      // The light breathes a little, so the sheet never looks frozen.
      const breathe = 0.92 + 0.08 * Math.sin(t * 0.4)
      const centres = blooms.map((b) => ({
        x: w * (0.55 + b.ax * Math.sin((t / b.px) * 2 * Math.PI + b.ph)),
        y: h * (0.45 + b.ay * Math.sin((t / b.py) * 2 * Math.PI + b.ph * 1.3)) - shift,
        r2: (b.r * diag) ** 2,
        rgb: b.rgb,
      }))
      // A scan band sweeps down every 9s, re-printing and briefly lifting what it crosses.
      const scanPeriod = 9
      const scanY = ((t % scanPeriod) / scanPeriod) * (h + 240) - 120
      const grey = dark ? [140, 140, 136] : [120, 118, 112]
      const data = image!.data
      const base = dark ? 0.09 : 0.1
      const lit = dark ? 0.85 : 0.6

      ctx.clearRect(0, 0, w, h)
      for (let row = 0; row < rows; row++) {
        const y = row * PITCH + PITCH / 2
        const scan = Math.max(0, 1 - Math.abs(y - scanY) / 70)
        for (let col = 0; col < cols; col++) {
          const x = col * PITCH + PITCH / 2
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
            lampW = lamp.s * Math.exp(-(dx * dx + dy * dy) / (120 * 120))
          }
          const i = row * cols + col
          const k = Math.min(1, (wsum * breathe + lampW * 0.7) * (1 + scan * 0.35))

          // Hue from the blooms; grey where they don't reach; a hot core where they're strongest.
          const mix = Math.min(1, k * 1.5)
          const cr = wsum > 0.001 ? r / wsum : grey[0]!
          const cg = wsum > 0.001 ? g / wsum : grey[1]!
          const cb = wsum > 0.001 ? b / wsum : grey[2]!
          let pr = grey[0]! + (cr - grey[0]!) * mix
          let pg = grey[1]! + (cg - grey[1]!) * mix
          let pb = grey[2]! + (cb - grey[2]!) * mix
          const hot = Math.max(0, (k - 0.7) / 0.3)
          if (dark) {
            pr += (255 - pr) * hot * 0.55
            pg += (255 - pg) * hot * 0.55
            pb += (255 - pb) * hot * 0.55
          } else {
            // On paper the core deepens instead of whitening.
            pr *= 1 - hot * 0.35
            pg *= 1 - hot * 0.35
            pb *= 1 - hot * 0.35
          }
          data[i * 4] = pr
          data[i * 4 + 1] = pg
          data[i * 4 + 2] = pb
          data[i * 4 + 3] = Math.round(k * 255)

          // The light level chooses how heavy the type is; changing band re-prints the glyph.
          const want = k < 0.12 ? 0 : k < 0.35 ? 1 : k < 0.65 ? 2 : 3
          if (want !== band[i] || (live && Math.random() < k * 0.02 + lampW * 0.3 + scan * 0.12)) {
            band[i] = want
            glyph[i] = pick(want)
          }
          ctx.globalAlpha = base + k * k * lit
          ctx.drawImage(atlas, glyph[i]! * PITCH * dpr, 0, PITCH * dpr, PITCH * dpr, col * PITCH, row * PITCH, PITCH, PITCH)
        }
      }
      mctx.putImageData(image!, 0, 0)
      hctx.clearRect(0, 0, haze.width, haze.height)
      hctx.imageSmoothingEnabled = true
      hctx.drawImage(map, 0, 0, haze.width, haze.height)

      ctx.globalAlpha = 1
      ctx.imageSmoothingEnabled = true
      ctx.globalCompositeOperation = "source-in"
      ctx.drawImage(map, 0, 0, cols, rows, 0, 0, cols * PITCH, rows * PITCH)
      // The haze sits under the type: a soft glow in the dark, a colour wash on paper.
      ctx.globalCompositeOperation = "destination-over"
      ctx.globalAlpha = dark ? 0.3 : 0.16
      ctx.drawImage(haze, 0, 0, haze.width, haze.height, -PITCH * 2, -PITCH * 2, cols * PITCH + PITCH * 4, rows * PITCH + PITCH * 4)
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
      if (cursorOff()) return
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
