"use client"

import { useEffect, useRef } from "react"
import { CELL, fitCanvas, gridOffsetX, gutterCols, prefersStill, readTheme, strokeGrid, watchTheme } from "./canvas"

/**
 * DRAFT: a split-flap board, like the departures board in an old station. Each
 * grid cell is a tile. Every couple of seconds a short message clatters in
 * down the side margins (a ticker and its move, or league news), holds, then
 * flips back to blank. Tiles under the cursor flutter through a few letters
 * and settle. Tickers and news are illustrative until wired to the league.
 */
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-.%#"
type Tone = "fg" | "gain" | "loss" | "brand"
type Tile = { ch: string; target: string; flipUntil: number; tone: Tone; next: number }

const MESSAGES: [string, string, Tone][] = [
  ["NVDA", "+2.1", "gain"], ["AAPL", "-0.4", "loss"], ["VTI", "+0.3", "gain"], ["MSFT", "+0.9", "gain"],
  ["TSLA", "-1.9", "loss"], ["MAYA", "#1", "brand"], ["WK 4", "FRI", "brand"], ["YOU", "UP 2", "gain"],
  ["QQQ", "+0.5", "gain"], ["BND", "-0.1", "loss"], ["SAM", "#3", "brand"], ["PLTR", "+3.4", "gain"],
]

export function FlapField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    let theme = readTheme()
    let size = { w: 0, h: 0 }
    let cols = 0
    let rows = 0
    let tiles: (Tile | null)[] = []
    let pointer: { x: number; y: number } | null = null
    let lastCell = -1
    const live: { cells: number[]; until: number }[] = []
    let msgIndex = 0

    const build = () => {
      size = fitCanvas(canvas, ctx)
      cols = Math.ceil((size.w - gridOffsetX(size.w)) / CELL)
      rows = Math.ceil(size.h / CELL)
      tiles = new Array(cols * rows).fill(null)
      live.length = 0
    }

    const tone = (t: Tone) => (t === "gain" ? theme.gain : t === "loss" ? theme.loss : t === "brand" ? theme.brand : theme.fg)

    const setTile = (i: number, target: string, t: Tone, now: number, spin: number) => {
      const tile = tiles[i] ?? { ch: " ", target: " ", flipUntil: 0, tone: t, next: 0 }
      tile.target = target
      tile.tone = t
      tile.flipUntil = now + spin
      tiles[i] = tile
    }

    // Place a two-line message where a side margin is free; fall back to anywhere.
    const spawn = (now: number) => {
      const [top, bottom, t] = MESSAGES[msgIndex++ % MESSAGES.length]!
      const width = Math.max(top.length, bottom.length)
      const g = gutterCols(size.w)
      const useGutter = g >= width
      for (let attempt = 0; attempt < 12; attempt++) {
        const left = Math.random() < 0.5
        const col = useGutter
          ? // Column 0 is partly off-screen, so the left margin starts at column 1.
            left ? 1 + Math.floor(Math.random() * Math.max(1, g - width)) : cols - g + Math.floor(Math.random() * (g - width + 1))
          : Math.floor(Math.random() * Math.max(1, cols - width))
        const row = 2 + Math.floor(Math.random() * Math.max(1, rows - 4))
        const cells: number[] = []
        for (let r = 0; r < 2; r++) for (let c = 0; c < width; c++) cells.push((row + r) * cols + col + c)
        const clash = cells.some((i) => i >= tiles.length || live.some((m) => m.cells.includes(i) || m.cells.includes(i - cols) || m.cells.includes(i + cols)))
        if (clash) continue
        cells.forEach((i, k) => {
          const r = Math.floor(k / width)
          const c = k % width
          const word = r === 0 ? top : bottom
          const ch = word[c] ?? " "
          setTile(i, ch, r === 0 ? "fg" : t, now, 350 + c * 110 + r * 180)
        })
        live.push({ cells, until: now + 6500 })
        return
      }
    }

    const draw = (now: number) => {
      const { w, h } = size
      const ox = gridOffsetX(w)
      ctx.clearRect(0, 0, w, h)
      strokeGrid(ctx, w, h, theme.fg, theme.dark ? 0.065 : 0.06)

      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `600 26px ${theme.mono}`
      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i]
        if (!tile) continue
        const flipping = now < tile.flipUntil
        if (!flipping && tile.target === " ") {
          tiles[i] = null
          continue
        }
        const col = i % cols
        const row = (i - col) / cols
        const x = ox + col * CELL
        const y = row * CELL

        // The tile itself: a slightly raised card with the split across its middle.
        ctx.globalAlpha = theme.dark ? 0.07 : 0.045
        ctx.fillStyle = theme.fg
        ctx.beginPath()
        ctx.roundRect(x + 4, y + 4, CELL - 8, CELL - 8, 5)
        ctx.fill()
        ctx.globalAlpha = theme.dark ? 0.12 : 0.08
        ctx.fillRect(x + 4, y + CELL / 2 - 0.5, CELL - 8, 1)

        if (flipping && now >= tile.next) {
          tile.ch = CHARS[Math.floor(Math.random() * CHARS.length)]!
          tile.next = now + 70
        } else if (!flipping) tile.ch = tile.target

        // Mid-flip the glyph squashes toward the split, which is what sells the flap.
        const squash = flipping ? 0.35 + 0.65 * Math.abs(Math.cos((now / 70) * Math.PI)) : 1
        ctx.globalAlpha = (flipping ? 0.28 : 0.42) * (theme.dark ? 1 : 0.85)
        ctx.fillStyle = tone(tile.tone)
        ctx.save()
        ctx.translate(x + CELL / 2, y + CELL / 2)
        ctx.scale(1, squash)
        ctx.fillText(tile.ch, 0, 1)
        ctx.restore()
      }
      ctx.globalAlpha = 1
    }

    build()
    if (prefersStill()) {
      spawn(0)
      spawn(0)
      tiles.forEach((t) => t && (t.flipUntil = 0))
      draw(1)
      return () => undefined
    }

    let frame = 0
    let last = 0
    let lastSpawn = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < 33) return
      last = now
      if (now - lastSpawn > 2200 && live.length < 6) {
        lastSpawn = now
        spawn(now)
      }
      for (let k = live.length - 1; k >= 0; k--) {
        const m = live[k]!
        if (now > m.until) {
          m.cells.forEach((i, n) => setTile(i, " ", "fg", now, 250 + (n % 5) * 90))
          live.splice(k, 1)
        }
      }
      // The cursor riffles the tiles it passes over.
      if (pointer) {
        const col = Math.floor((pointer.x - gridOffsetX(size.w)) / CELL)
        const row = Math.floor(pointer.y / CELL)
        const i = row * cols + col
        if (i !== lastCell && col >= 0 && col < cols && row >= 0 && row < rows) {
          lastCell = i
          const busy = live.some((m) => m.cells.includes(i))
          if (!busy) setTile(i, " ", "brand", now, 420)
        }
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

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10" />
}
