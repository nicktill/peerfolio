"use client"

import { useEffect, useRef } from "react"
import { CELL, fitCanvas, gridOffsetX, prefersStill, readTheme, strokeGrid, watchTheme } from "./canvas"

/**
 * DRAFT: a market heatmap made of the checkerboard itself. Positions become
 * blocks snapped to the 48px grid, sized by weight and tinted by today's move
 * (deeper colour, bigger move). Faint by default; the block under the cursor
 * brightens and shows its label, and every so often one block "ticks" as if a
 * price just printed.
 *
 * Tickers and moves are illustrative for now; wired up, these would be the
 * league's combined holdings or the viewer's own positions.
 */
type Item = { t: string; w: number; c: number }

const MARKET: Item[] = [
  { t: "MSFT", w: 30, c: 0.1 }, { t: "AAPL", w: 28, c: 2.57 }, { t: "NVDA", w: 26, c: -1.89 }, { t: "GOOG", w: 20, c: -1.17 },
  { t: "AMZN", w: 18, c: -1.63 }, { t: "META", w: 12, c: -3.14 }, { t: "AVGO", w: 11, c: -2.39 }, { t: "TSLA", w: 10, c: -0.91 },
  { t: "BRK.B", w: 9, c: 1.38 }, { t: "LLY", w: 9, c: 6.98 }, { t: "JPM", w: 8, c: 0.3 }, { t: "V", w: 7, c: -0.44 },
  { t: "WMT", w: 6, c: 0.51 }, { t: "XOM", w: 6, c: 1.08 }, { t: "JNJ", w: 5, c: 0.67 }, { t: "MA", w: 5, c: -1.12 },
  { t: "COST", w: 5, c: 1.18 }, { t: "HD", w: 5, c: 0.42 }, { t: "ABBV", w: 4, c: -6.93 }, { t: "ORCL", w: 4, c: -4.61 },
  { t: "KO", w: 4, c: 0.22 }, { t: "PEP", w: 3, c: 2.74 }, { t: "AMD", w: 3, c: -14.6 }, { t: "PLTR", w: 3, c: -9.96 },
  { t: "CVX", w: 3, c: 0.88 }, { t: "MRK", w: 3, c: 2.54 }, { t: "DIS", w: 2, c: 1.72 }, { t: "NFLX", w: 2, c: -0.13 },
  { t: "CAT", w: 2, c: 1.7 }, { t: "GE", w: 2, c: -0.6 }, { t: "UNH", w: 2, c: -1.85 }, { t: "IBM", w: 2, c: 0.4 },
  { t: "MU", w: 2, c: -3.63 }, { t: "GS", w: 2, c: -3.03 }, { t: "VZ", w: 1, c: 0.9 }, { t: "T", w: 1, c: 1.1 },
  { t: "INTC", w: 1, c: -0.89 }, { t: "HOOD", w: 1, c: -3.2 }, { t: "SBUX", w: 1, c: 0.7 }, { t: "PFE", w: 1, c: 0.2 },
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

    const build = () => {
      size = fitCanvas(canvas, ctx)
      const cols = Math.ceil((size.w - gridOffsetX(size.w)) / CELL)
      const rows = Math.ceil(size.h / CELL)
      blocks = []
      layout([...MARKET].sort((p, q) => q.w - p.w), 0, 0, cols, rows, blocks)
    }

    const draw = (now: number) => {
      const { w, h } = size
      const ox = gridOffsetX(w)
      // Labels stay out of the content column, where they'd sit under page text.
      const contentLeft = (w - Math.min(w, 1184)) / 2
      ctx.clearRect(0, 0, w, h)

      for (const b of blocks) {
        const px = ox + b.x * CELL
        const py = b.y * CELL
        const bw = b.w2 * CELL
        const bh = b.h2 * CELL
        // Intensity follows the size of the move, like a real heatmap, but capped low.
        const strength = Math.min(1, Math.abs(b.c) / 4)
        const base = theme.glow * (theme.dark ? 0.35 + strength * 0.9 : 0.25 + strength * 0.7)
        ctx.globalAlpha = Math.min(0.5, base + b.hover * 0.12 + b.flash * 0.18)
        ctx.fillStyle = b.c >= 0 ? theme.gain : theme.loss
        ctx.fillRect(px + 2, py + 2, bw - 3, bh - 3)

        // Labels only where there's room, and quieter than any real text on the page.
        const cx = px + bw / 2
        if (b.w2 >= 2 && b.h2 >= 2 && (cx < contentLeft || cx > w - contentLeft)) {
          const fs = Math.max(11, Math.min(46, bw / (b.t.length * 0.9), bh * 0.3))
          ctx.globalAlpha = (theme.dark ? 0.16 : 0.13) + b.hover * 0.35 + b.flash * 0.15
          ctx.fillStyle = theme.fg
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.font = `600 ${fs}px ${theme.mono}`
          ctx.fillText(b.t, px + bw / 2, py + bh / 2 - fs * 0.35)
          ctx.font = `500 ${Math.max(10, fs * 0.42)}px ${theme.mono}`
          ctx.fillText(`${b.c >= 0 ? "+" : ""}${b.c.toFixed(2)}%`, px + bw / 2, py + bh / 2 + fs * 0.45)
        }
      }

      strokeGrid(ctx, w, h, theme.fg, theme.dark ? 0.07 : 0.06)
      // Block outlines a touch heavier than the grid, so the treemap reads as shapes.
      ctx.globalAlpha = theme.dark ? 0.16 : 0.12
      ctx.strokeStyle = theme.dark ? "#000" : "#fff"
      ctx.lineWidth = 2
      for (const b of blocks) ctx.strokeRect(ox + b.x * CELL + 1, b.y * CELL + 1, b.w2 * CELL - 1, b.h2 * CELL - 1)
      ctx.globalAlpha = 1
      void now
    }

    build()
    if (prefersStill()) {
      draw(0)
      const onResize = () => {
        build()
        draw(0)
      }
      window.addEventListener("resize", onResize)
      const stop = watchTheme(() => {
        theme = readTheme()
        draw(0)
      })
      return () => {
        stop()
        window.removeEventListener("resize", onResize)
      }
    }

    let frame = 0
    let last = 0
    let lastTick = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < 33) return
      const dt = last ? Math.min(now - last, 100) : 16
      last = now

      // A price prints somewhere: one block brightens and its move nudges.
      if (now - lastTick > 1400) {
        lastTick = now
        const b = blocks[Math.floor(Math.random() * blocks.length)]
        if (b) {
          b.flash = 1
          b.c = Math.round((b.c + (Math.random() - 0.5) * 0.3) * 100) / 100
        }
      }
      const ox = gridOffsetX(size.w)
      for (const b of blocks) {
        b.flash *= Math.exp(-dt / 700)
        const inside =
          pointer &&
          pointer.x >= ox + b.x * CELL && pointer.x < ox + (b.x + b.w2) * CELL &&
          pointer.y >= b.y * CELL && pointer.y < (b.y + b.h2) * CELL
        b.hover += ((inside ? 1 : 0) - b.hover) * Math.min(1, dt / 160)
      }
      draw(now)
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

  return <canvas ref={canvasRef} aria-hidden className="bg-gutters pointer-events-none fixed inset-0 -z-10" />
}
