"use client"

import { useEffect, useRef } from "react"
import { CELL, fitCanvas, gridOffsetX, gutters, moodFromUrl, prefersStill, readTheme, strokeGrid, watchTheme, cursorOff } from "./canvas"

/**
 * DRAFT: Swiss-precise order books in the side margins. Each margin holds a
 * depth ladder for one ticker: asks above the spread in loss ink, bids below
 * in gain ink, bars anchored to the edge nearest the content and growing
 * outward with cumulative size. Levels breathe as orders come and go, the mid
 * price ticks, and now and then a level gets taken and flashes. The day's mood
 * tilts the book: heavier bids and upticks when you're up, the reverse when down.
 *
 * Rows are half a grid cell tall, so every other ladder line is a grid line.
 */
const PITCH = CELL / 2
const LEVELS = 9

type Level = { size: number; target: number; flash: number }
type Book = { ticker: string; price: number; tickFlash: number; side: "left" | "right"; asks: Level[]; bids: Level[] }

export function DepthField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const up = moodFromUrl() === "up"
    let theme = readTheme()
    let size = fitCanvas(canvas, ctx)
    let pointer: { x: number; y: number } | null = null

    const level = (k: number, heavy: boolean): Level => {
      const s = (k + 1) * (0.7 + Math.random() * 0.6) * (heavy ? 1.25 : 0.85)
      return { size: s, target: s, flash: 0 }
    }
    const book = (ticker: string, price: number, side: "left" | "right"): Book => ({
      ticker,
      price,
      side,
      tickFlash: 0,
      asks: Array.from({ length: LEVELS }, (_, k) => level(k, !up)),
      bids: Array.from({ length: LEVELS }, (_, k) => level(k, up)),
    })
    const books = [book("NVDA", 182.4, "left"), book("VTI", 291.12, "right")]

    const draw = () => {
      const { w, h } = size
      const ox = gridOffsetX(w)
      ctx.clearRect(0, 0, w, h)
      strokeGrid(ctx, w, h, theme.fg, theme.dark ? 0.065 : 0.06)

      const { g, left, right } = gutters(w)
      if (g < 4) return
      const midRow = Math.round(h / 2 / CELL)
      const midY = midRow * CELL

      for (const b of books) {
        const range = b.side === "left" ? left : right
        const x0 = ox + range.from * CELL
        const x1 = ox + (range.to + 1) * CELL
        const width = x1 - x0
        const maxBar = width - 64
        const anchor = b.side === "left" ? x1 - 8 : x0 + 8
        const dir = b.side === "left" ? -1 : 1
        const maxSize = Math.max(...b.asks.map((l) => l.size), ...b.bids.map((l) => l.size))
        const step = 0.05

        const rowsOf = (levels: Level[], above: boolean) =>
          levels.forEach((l, k) => {
            const y = above ? midY - (k + 1) * PITCH - PITCH / 2 : midY + (k + 1) * PITCH - PITCH / 2
            const len = (l.size / maxSize) * maxBar
            // Levels far from the spread fade, like they're out of focus.
            const fade = 1 - k / (LEVELS + 2)
            const hot = pointer && pointer.y >= y && pointer.y < y + PITCH && pointer.x >= x0 && pointer.x < x1
            ctx.globalAlpha = ((theme.dark ? 0.2 : 0.17) + l.flash * 0.35 + (hot ? 0.15 : 0)) * fade
            ctx.fillStyle = above ? theme.loss : theme.gain
            ctx.beginPath()
            ctx.roundRect(dir < 0 ? anchor - len : anchor, y + 5, len, PITCH - 10, 2)
            ctx.fill()

            // Price at the outer edge, size beside the bar when hovered.
            const price = above ? b.price + (k + 1) * step : b.price - (k + 1) * step
            ctx.globalAlpha = (theme.dark ? 0.4 : 0.38) * fade + (hot ? 0.4 : 0)
            ctx.fillStyle = theme.fg
            ctx.font = `500 10px ${theme.mono}`
            ctx.textAlign = dir < 0 ? "left" : "right"
            ctx.textBaseline = "middle"
            ctx.fillText(price.toFixed(2), dir < 0 ? x0 + 6 : x1 - 6, y + PITCH / 2)
            if (hot) {
              ctx.textAlign = dir < 0 ? "right" : "left"
              ctx.fillText(`${Math.round(l.size * 120)}`, dir < 0 ? anchor - len - 6 : anchor + len + 6, y + PITCH / 2)
            }
          })

        rowsOf(b.asks, true)
        rowsOf(b.bids, false)

        // The spread: a hairline across the margin with the ticker and last price on it.
        ctx.globalAlpha = theme.dark ? 0.22 : 0.18
        ctx.strokeStyle = theme.fg
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x0 + 4, midY + 0.5)
        ctx.lineTo(x1 - 4, midY + 0.5)
        ctx.stroke()
        const label = `${b.ticker}  ${b.price.toFixed(2)}`
        ctx.font = `600 13px ${theme.mono}`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        const tw = ctx.measureText(label).width + 16
        ctx.globalAlpha = 1
        ctx.fillStyle = theme.dark ? "#111110" : "#fbfbfa"
        ctx.fillRect(x0 + width / 2 - tw / 2, midY - 9, tw, 18)
        ctx.globalAlpha = 0.55 + b.tickFlash * 0.45
        ctx.fillStyle = b.tickFlash > 0.05 ? (up ? theme.gain : theme.loss) : theme.fg
        ctx.fillText(label, x0 + width / 2, midY + 1)
      }
      ctx.globalAlpha = 1
    }

    if (prefersStill()) {
      draw()
      return () => undefined
    }

    let frame = 0
    let last = 0
    let lastOrders = 0
    let lastTick = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < 33) return
      const dt = last ? Math.min(now - last, 100) : 16
      last = now
      // Orders arrive and cancel: a few levels get new targets.
      if (now - lastOrders > 450) {
        lastOrders = now
        for (const b of books)
          for (const side of [b.asks, b.bids]) {
            const l = side[Math.floor(Math.random() * LEVELS)]!
            l.target = Math.max(0.3, l.target * (0.75 + Math.random() * 0.55))
          }
      }
      // The mid ticks, mostly with the mood; the level nearest it gets taken.
      if (now - lastTick > 1600) {
        lastTick = now
        const b = books[Math.floor(Math.random() * books.length)]!
        const dirUp = Math.random() < (up ? 0.72 : 0.28)
        b.price = Math.round((b.price + (dirUp ? 0.05 : -0.05)) * 100) / 100
        b.tickFlash = 1
        const taken = dirUp ? b.asks[0]! : b.bids[0]!
        taken.flash = 1
        taken.target = Math.max(0.4, taken.target * 0.4)
      }
      const ease = Math.min(1, dt / 380)
      for (const b of books) {
        b.tickFlash *= Math.exp(-dt / 600)
        for (const l of [...b.asks, ...b.bids]) {
          l.size += (l.target - l.size) * ease
          l.flash *= Math.exp(-dt / 500)
          // Taken levels refill slowly toward their natural depth.
          l.target += ((b.asks.indexOf(l) + b.bids.indexOf(l) + 2) * 0.9 - l.target) * 0.004
        }
      }
      draw()
    }

    const onMove = (e: PointerEvent) => {
      if (cursorOff()) return
      if (e.pointerType === "mouse") pointer = { x: e.clientX, y: e.clientY }
    }
    const onLeave = () => (pointer = null)
    const onResize = () => (size = fitCanvas(canvas, ctx))
    const stop = watchTheme(() => (theme = readTheme()))
    window.addEventListener("resize", onResize)
    window.addEventListener("pointermove", onMove, { passive: true })
    document.addEventListener("pointerleave", onLeave)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      stop()
      window.removeEventListener("resize", onResize)
      window.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerleave", onLeave)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10" />
}
