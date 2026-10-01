"use client"

import { useEffect, useRef } from "react"
import { CELL, fitCanvas, gridOffsetX, gutters, prefersStill, readTheme, strokeGrid, watchTheme } from "./canvas"

/**
 * DRAFT: a market heatmap that lives in the side margins. Positions become
 * soft tiles snapped to the checker grid, sized by weight and barely tinted by
 * the day's move; each carries its company logo (the app's logo proxy, with the
 * same monogram fallback as TickerLogo). Hovering a tile warms it, brings the
 * logo to full colour and shows the move. Nothing sits behind the content.
 *
 * Tickers and moves are illustrative; wired up these would be the viewer's
 * positions or the league's combined holdings.
 */
type Item = { t: string; w: number; c: number }

const LEFT: Item[] = [
  { t: "MSFT", w: 30, c: 0.1 }, { t: "NVDA", w: 26, c: -1.89 }, { t: "AMZN", w: 18, c: -1.63 }, { t: "AVGO", w: 11, c: -2.39 },
  { t: "BRK.B", w: 9, c: 1.38 }, { t: "JPM", w: 8, c: 0.3 }, { t: "WMT", w: 6, c: 0.51 }, { t: "JNJ", w: 5, c: 0.67 },
  { t: "COST", w: 5, c: 1.18 }, { t: "ABBV", w: 4, c: -2.93 }, { t: "KO", w: 4, c: 0.22 }, { t: "AMD", w: 3, c: -3.6 },
  { t: "CVX", w: 3, c: 0.88 }, { t: "NFLX", w: 2, c: -0.13 }, { t: "GE", w: 2, c: -0.6 }, { t: "MU", w: 2, c: -1.63 },
]
const RIGHT: Item[] = [
  { t: "AAPL", w: 28, c: 2.57 }, { t: "GOOG", w: 20, c: -1.17 }, { t: "META", w: 12, c: -3.14 }, { t: "TSLA", w: 10, c: -0.91 },
  { t: "LLY", w: 9, c: 4.98 }, { t: "V", w: 7, c: -0.44 }, { t: "XOM", w: 6, c: 1.08 }, { t: "MA", w: 5, c: -1.12 },
  { t: "HD", w: 5, c: 0.42 }, { t: "ORCL", w: 4, c: -2.61 }, { t: "PEP", w: 3, c: 1.74 }, { t: "PLTR", w: 3, c: 3.96 },
  { t: "MRK", w: 3, c: 2.54 }, { t: "DIS", w: 2, c: 1.72 }, { t: "CAT", w: 2, c: 1.7 }, { t: "IBM", w: 2, c: 0.4 },
]

type Block = Item & { x: number; y: number; w2: number; h2: number; flash: number; hover: number }

/** Recursive halving on whole grid cells, so every edge lands on a grid line. */
function layout(items: Item[], x: number, y: number, w: number, h: number, out: Block[]) {
  if (w <= 0 || h <= 0 || items.length === 0) return
  if (items.length === 1 || (w === 1 && h === 1)) {
    out.push({ ...items[0]!, x, y, w2: w, h2: h, flash: 0, hover: 0 })
    return
  }
  const total = items.reduce((s, i) => s + i.w, 0)
  let acc = 0
  let k = 0
  while (k < items.length - 1 && acc + items[k]!.w <= total / 2) acc += items[k++]!.w
  if (k === 0) acc += items[k++]!.w
  const frac = acc / total
  const a = items.slice(0, k)
  const b = items.slice(k)
  if ((w >= h && w > 1) || h === 1) {
    const wa = Math.min(w - 1, Math.max(1, Math.round(w * frac)))
    layout(a, x, y, wa, h, out)
    layout(b, x + wa, y, w - wa, h, out)
  } else {
    const ha = Math.min(h - 1, Math.max(1, Math.round(h * frac)))
    layout(a, x, y, w, ha, out)
    layout(b, x, y + ha, w, h - ha, out)
  }
}

const hue = (s: string) => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

export function HeatmapField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    let theme = readTheme()
    let size = { w: 0, h: 0 }
    let blocks: Block[] = []
    let pointer: { x: number; y: number } | null = null
    const logos = new Map<string, HTMLImageElement | null>()

    const logo = (t: string) => {
      if (!logos.has(t)) {
        logos.set(t, null)
        const img = new Image()
        img.onload = () => logos.set(t, img)
        img.src = `/api/market/logo/${encodeURIComponent(t)}`
      }
      return logos.get(t) ?? null
    }

    const build = () => {
      size = fitCanvas(canvas, ctx)
      const { g, left, right } = gutters(size.w)
      const rows = Math.ceil(size.h / CELL)
      blocks = []
      if (g < 3) return
      // One treemap per margin, a row of breathing room above and below.
      layout([...LEFT].sort((p, q) => q.w - p.w), left.from, 1, left.to - left.from + 1, rows - 2, blocks)
      layout([...RIGHT].sort((p, q) => q.w - p.w), right.from, 1, right.to - right.from + 1, rows - 2, blocks)
    }

    const draw = () => {
      const { w, h } = size
      const ox = gridOffsetX(w)
      ctx.clearRect(0, 0, w, h)
      strokeGrid(ctx, w, h, theme.fg, theme.dark ? 0.065 : 0.06)

      for (const b of blocks) {
        const px = ox + b.x * CELL + 3
        const py = b.y * CELL + 3
        const bw = b.w2 * CELL - 6
        const bh = b.h2 * CELL - 6
        // Tint follows the size of the move, but stays a whisper either way.
        const strength = Math.min(1, Math.abs(b.c) / 3)
        const tint = (theme.dark ? 0.05 : 0.06) + strength * (theme.dark ? 0.07 : 0.08)
        ctx.globalAlpha = tint + b.hover * 0.1 + b.flash * 0.06
        ctx.fillStyle = b.c >= 0 ? theme.gain : theme.loss
        ctx.beginPath()
        ctx.roundRect(px, py, bw, bh, 8)
        ctx.fill()

        if (b.w2 < 2 || b.h2 < 2) continue
        // The logo chip, sized to the tile, quiet until hovered.
        const s = Math.min(40, Math.max(22, Math.min(bw, bh) * 0.32))
        const cx = px + bw / 2
        const cy = py + bh / 2 - (b.hover > 0.05 ? 10 * b.hover : 0)
        const img = logo(b.t)
        ctx.globalAlpha = (theme.dark ? 0.32 : 0.42) + b.hover * 0.58
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(cx - s / 2, cy - s / 2, s, s, s * 0.28)
        ctx.clip()
        if (img) {
          ctx.fillStyle = "#fff"
          ctx.fillRect(cx - s / 2, cy - s / 2, s, s)
          if (b.hover < 0.5) ctx.filter = "grayscale(1)"
          ctx.drawImage(img, cx - s / 2 + 4, cy - s / 2 + 4, s - 8, s - 8)
          ctx.filter = "none"
        } else {
          const hh = hue(b.t)
          ctx.fillStyle = theme.dark ? `hsl(${hh}, 25%, 22%)` : `hsl(${hh}, 55%, 92%)`
          ctx.fillRect(cx - s / 2, cy - s / 2, s, s)
          ctx.fillStyle = theme.dark ? `hsl(${hh}, 45%, 75%)` : `hsl(${hh}, 55%, 30%)`
          ctx.font = `700 ${Math.round(s * (b.t.length > 3 ? 0.26 : 0.32))}px ${theme.mono}`
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(b.t.slice(0, 4), cx, cy + 1)
        }
        ctx.restore()

        // The move appears under the logo on hover.
        if (b.hover > 0.05) {
          ctx.globalAlpha = b.hover * 0.85
          ctx.fillStyle = b.c >= 0 ? theme.gain : theme.loss
          ctx.font = `600 12px ${theme.mono}`
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(`${b.t}  ${b.c >= 0 ? "+" : ""}${b.c.toFixed(2)}%`, cx, cy + s / 2 + 14)
        }
      }
      ctx.globalAlpha = 1
    }

    build()
    if (prefersStill()) {
      draw()
      const onResize = () => {
        build()
        draw()
      }
      window.addEventListener("resize", onResize)
      return () => window.removeEventListener("resize", onResize)
    }

    let frame = 0
    let last = 0
    let lastTick = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < 33) return
      const dt = last ? Math.min(now - last, 100) : 16
      last = now
      // A price prints now and then: one tile warms briefly and its move nudges.
      if (now - lastTick > 2200 && blocks.length) {
        lastTick = now
        const b = blocks[Math.floor(Math.random() * blocks.length)]!
        b.flash = 1
        b.c = Math.round((b.c + (Math.random() - 0.5) * 0.2) * 100) / 100
      }
      const ox = gridOffsetX(size.w)
      for (const b of blocks) {
        b.flash *= Math.exp(-dt / 900)
        const inside =
          pointer &&
          pointer.x >= ox + b.x * CELL && pointer.x < ox + (b.x + b.w2) * CELL &&
          pointer.y >= b.y * CELL && pointer.y < (b.y + b.h2) * CELL
        b.hover += ((inside ? 1 : 0) - b.hover) * Math.min(1, dt / 180)
      }
      draw()
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") pointer = { x: e.clientX, y: e.clientY }
    }
    const onLeave = () => (pointer = null)
    const stop = watchTheme(() => (theme = readTheme()))
    window.addEventListener("resize", build)
    window.addEventListener("pointermove", onMove, { passive: true })
    document.addEventListener("pointerleave", onLeave)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      stop()
      window.removeEventListener("resize", build)
      window.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerleave", onLeave)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10" />
}
