"use client"

import { useEffect, useRef } from "react"
import { CELL, fitCanvas, gridOffsetX, gutters, moodFromUrl, prefersStill, readTheme, strokeGrid, watchTheme } from "./canvas"

/**
 * DRAFT: market mood as candlesticks. On an up day, short runs of green candles
 * print one after another, each a step higher, then drift upward and fade, like
 * a chart drawing itself in the margins. On a down day the runs are red and
 * step down. One colour, one direction, nothing chasing the cursor.
 */
type Candle = { x: number; base: number; body: number; wickHi: number; wickLo: number; born: number }

const LIFE = 5200
const GROW = 520

export function CandleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const up = moodFromUrl() === "up"
    let theme = readTheme()
    let size = fitCanvas(canvas, ctx)
    const candles: Candle[] = []
    const queue: (Candle & { at: number })[] = []

    // A run: 4-7 candles in neighbouring columns, each opening near the last close.
    const startRun = (now: number) => {
      const { g, cols, left, right } = gutters(size.w)
      const rows = Math.floor(size.h / CELL)
      const len = 4 + Math.floor(Math.random() * 4)
      let fromCol: number
      let count = len
      if (g >= 3) {
        const side = Math.random() < 0.5 ? left : right
        count = Math.min(len, side.to - side.from + 1)
        fromCol = side.from + Math.floor(Math.random() * Math.max(1, side.to - side.from + 2 - count))
      } else fromCol = Math.floor(Math.random() * Math.max(1, cols - len))
      // Up runs start low and climb; down runs start high and fall.
      let level = up ? rows * (0.55 + Math.random() * 0.35) : rows * (0.1 + Math.random() * 0.3)
      for (let k = 0; k < count; k++) {
        const body = 0.5 + Math.random() * 1.4
        const base = level
        level += (up ? -1 : 1) * (body * (0.55 + Math.random() * 0.35))
        queue.push({
          x: fromCol + k,
          base,
          body,
          wickHi: 0.15 + Math.random() * 0.45,
          wickLo: 0.1 + Math.random() * 0.35,
          born: 0,
          at: now + k * 260,
        })
      }
    }

    const draw = (now: number) => {
      const { w, h } = size
      const ox = gridOffsetX(w)
      ctx.clearRect(0, 0, w, h)
      strokeGrid(ctx, w, h, theme.fg, theme.dark ? 0.065 : 0.06)

      const color = up ? theme.gain : theme.loss
      const peak = theme.dark ? 0.42 : 0.34
      ctx.fillStyle = color
      ctx.strokeStyle = color
      for (const c of candles) {
        const age = now - c.born
        const grow = Math.min(1, age / GROW)
        const eased = 1 - Math.pow(1 - grow, 3)
        // Printed candles drift with the trend and fade out over their life.
        const drift = (up ? -1 : 1) * (age / LIFE) * 0.9 * CELL
        const fade = age < 200 ? age / 200 : age > LIFE - 2200 ? Math.max(0, (LIFE - age) / 2200) : 1
        const cx = ox + c.x * CELL + CELL / 2
        const baseY = c.base * CELL + drift
        const bodyPx = c.body * CELL * eased
        const top = up ? baseY - bodyPx : baseY
        const bottom = up ? baseY : baseY + bodyPx

        ctx.globalAlpha = peak * fade * 0.75
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx, top - c.wickHi * CELL * eased)
        ctx.lineTo(cx, bottom + c.wickLo * CELL * eased)
        ctx.stroke()

        ctx.globalAlpha = peak * fade
        ctx.beginPath()
        ctx.roundRect(cx - 7, top, 14, Math.max(2, bottom - top), 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    if (prefersStill()) {
      startRun(0)
      for (const q of queue) candles.push({ ...q, born: -GROW - 400 })
      draw(0)
      return () => undefined
    }

    let frame = 0
    let last = 0
    let lastRun = -9999
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < 33) return
      last = now
      if (now - lastRun > 1500 && queue.length === 0 && candles.length < 22) {
        lastRun = now
        startRun(now)
      }
      for (let k = queue.length - 1; k >= 0; k--) {
        if (now >= queue[k]!.at) candles.push({ ...queue.splice(k, 1)[0]!, born: now })
      }
      for (let k = candles.length - 1; k >= 0; k--) if (now - candles[k]!.born > LIFE) candles.splice(k, 1)
      draw(now)
    }

    const onResize = () => (size = fitCanvas(canvas, ctx))
    const stop = watchTheme(() => (theme = readTheme()))
    window.addEventListener("resize", onResize)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      stop()
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10" />
}
