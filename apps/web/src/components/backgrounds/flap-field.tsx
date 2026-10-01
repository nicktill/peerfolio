"use client"

import { useEffect, useRef } from "react"
import { CELL, fitCanvas, gridOffsetX, gutters, prefersStill, readTheme, strokeGrid, watchTheme } from "./canvas"

/**
 * DRAFT: an old exchange quote board hung in each side margin. Rows of
 * split-flap tiles show a ticker, an arrow and the day's move. Every couple of
 * seconds one row updates and its tiles clatter through the alphabet in order,
 * left to right, the way the electromechanical boards did: the top flap folds
 * down over the split, then the bottom flap falls into place.
 *
 * Tiles are half a grid cell wide, two per checker cell, one row per cell, so
 * the board sits exactly on the background grid. Quotes are illustrative.
 */
const CHARSET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.+-▲▼"
const STEP_MS = 64
const MAX_STEPS = 9
const TILE_W = CELL / 2

type Tone = "fg" | "gain" | "loss"
type Tile = { cur: string; next: string; target: string; steps: number; stepAt: number; tone: Tone }
type Quote = { t: string; c: number }
type Row = { tiles: Tile[]; quote: Quote }
type Board = { col: number; row: number; width: number; rows: Row[]; title: string }

const POOL: Quote[] = [
  { t: "NVDA", c: 2.14 }, { t: "AAPL", c: -0.42 }, { t: "MSFT", c: 0.88 }, { t: "VTI", c: 0.31 }, { t: "TSLA", c: -1.92 },
  { t: "AMZN", c: 1.06 }, { t: "META", c: -3.14 }, { t: "QQQ", c: 0.54 }, { t: "VOO", c: 0.29 }, { t: "PLTR", c: 3.41 },
  { t: "HOOD", c: -3.2 }, { t: "GOOG", c: -1.17 }, { t: "BND", c: -0.05 }, { t: "LLY", c: 4.98 }, { t: "JPM", c: 0.3 },
  { t: "COST", c: 1.18 }, { t: "AMD", c: -2.6 }, { t: "VXUS", c: 0.17 }, { t: "NFLX", c: -0.13 }, { t: "XOM", c: 1.08 },
]

/** "NVDA ▲2.14" fitted to the tiles available. */
function format(q: Quote, width: number) {
  const arrow = q.c >= 0 ? "▲" : "▼"
  const t = q.t.padEnd(4).slice(0, 4)
  const mag = Math.abs(q.c)
  if (width >= 10) return `${t} ${arrow}${mag.toFixed(2).slice(0, 4).padStart(4)}`
  if (width >= 8) return `${t}${arrow}${mag.toFixed(1).padStart(3)}`
  return `${t}${arrow}`.slice(0, width)
}

const toneAt = (q: Quote, i: number) => (i < 4 ? "fg" : q.c >= 0 ? "gain" : "loss") as Tone

export function FlapField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    let theme = readTheme()
    let size = { w: 0, h: 0 }
    let boards: Board[] = []
    let pointer: { x: number; y: number } | null = null
    let poolAt = 0

    const setRow = (row: Row, q: Quote, now: number) => {
      row.quote = q
      const text = format(q, row.tiles.length)
      row.tiles.forEach((tile, i) => {
        const target = text[i] ?? " "
        tile.tone = toneAt(q, i)
        if (target === tile.target && tile.steps === 0) return
        tile.target = target
        // Real boards run through the drum in order; start a few flaps back so it never drags.
        const from = CHARSET.indexOf(tile.cur)
        const to = CHARSET.indexOf(target)
        const dist = (to - from + CHARSET.length) % CHARSET.length
        if (dist > MAX_STEPS) tile.cur = CHARSET[(to - MAX_STEPS + CHARSET.length) % CHARSET.length]!
        tile.steps = Math.min(dist, MAX_STEPS)
        tile.stepAt = now + i * 45
        tile.next = CHARSET[(CHARSET.indexOf(tile.cur) + 1) % CHARSET.length]!
      })
    }

    const build = (now: number) => {
      size = fitCanvas(canvas, ctx)
      const { g, left, right } = gutters(size.w)
      const rowsAvail = Math.floor(size.h / CELL)
      boards = []
      if (g < 4) return
      const width = Math.min(10, (g - 1) * 2)
      const count = Math.min(12, rowsAvail - 4)
      const make = (col: number, title: string): Board => ({
        col,
        row: 2,
        width,
        title,
        rows: Array.from({ length: count }, () => ({
          quote: { t: "", c: 0 },
          tiles: Array.from({ length: width }, () => ({ cur: " ", next: " ", target: " ", steps: 0, stepAt: 0, tone: "fg" as Tone })),
        })),
      })
      // Hug the content: left board right-aligned in its margin, right board left-aligned.
      const span = Math.ceil(width / 2)
      boards.push(make(left.to - span + 1, "MOVERS"))
      boards.push(make(right.from, "THE GROUP CHAT"))
      // Opening cascade: every row flips in from blank, top to bottom.
      boards.forEach((b, bi) =>
        b.rows.forEach((r, ri) => setRow(r, POOL[(poolAt++) % POOL.length]!, now + 200 + ri * 140 + bi * 70)),
      )
    }

    const color = (tone: Tone) => (tone === "gain" ? theme.gain : tone === "loss" ? theme.loss : theme.fg)

    /** One half of a glyph, squashed toward the split by `scale` (1 = flat on the tile). */
    const half = (ch: string, x: number, y: number, top: boolean, scale: number, tone: Tone, alpha: number) => {
      if (scale <= 0.01) return
      const mid = y + CELL / 2
      ctx.save()
      ctx.beginPath()
      ctx.rect(x + 2, top ? y + 5 : mid, TILE_W - 4, CELL / 2 - 5)
      ctx.clip()
      ctx.translate(0, mid)
      ctx.scale(1, scale)
      ctx.translate(0, -mid)
      // Flap face.
      ctx.globalAlpha = theme.dark ? 0.06 : 0.07
      ctx.fillStyle = theme.fg
      ctx.fillRect(x + 2, top ? y + 5 : mid, TILE_W - 4, CELL / 2 - 5)
      if (ch !== " ") {
        ctx.globalAlpha = alpha
        ctx.fillStyle = color(tone)
        ctx.fillText(ch, x + TILE_W / 2, mid + 1)
      }
      ctx.restore()
    }

    const draw = (now: number) => {
      const { w, h } = size
      const ox = gridOffsetX(w)
      ctx.clearRect(0, 0, w, h)
      strokeGrid(ctx, w, h, theme.fg, theme.dark ? 0.065 : 0.06)

      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      const glyph = theme.dark ? 0.44 : 0.42

      for (const b of boards) {
        const bx = ox + b.col * CELL
        const by = b.row * CELL
        const bw = Math.ceil(b.width / 2) * CELL
        const bh = b.rows.length * CELL

        // The board's housing and its nameplate.
        ctx.globalAlpha = theme.dark ? 0.35 : 0.035
        ctx.fillStyle = theme.dark ? "#000" : theme.fg
        ctx.beginPath()
        ctx.roundRect(bx - 6, by - 30, bw + 12, bh + 40, 10)
        ctx.fill()
        ctx.globalAlpha = theme.dark ? 0.1 : 0.08
        ctx.strokeStyle = theme.fg
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.globalAlpha = theme.dark ? 0.42 : 0.4
        ctx.fillStyle = theme.fg
        ctx.font = `600 10px ${theme.mono}`
        ctx.textAlign = "left"
        ctx.fillText(b.title.split("").join(" "), bx + 4, by - 15)
        ctx.textAlign = "center"

        ctx.font = `600 ${Math.round(CELL * 0.48)}px ${theme.mono}`
        b.rows.forEach((row, ri) => {
          const y = by + ri * CELL
          const hot = pointer && pointer.x >= bx && pointer.x < bx + bw && pointer.y >= y && pointer.y < y + CELL
          if (hot) {
            ctx.globalAlpha = theme.dark ? 0.06 : 0.04
            ctx.fillStyle = theme.fg
            ctx.fillRect(bx - 4, y + 2, bw + 8, CELL - 4)
          }
          row.tiles.forEach((tile, ti) => {
            const x = bx + ti * TILE_W
            const p = tile.steps > 0 && now >= tile.stepAt ? Math.min(1, (now - tile.stepAt) / STEP_MS) : 0
            if (p === 0) {
              half(tile.cur, x, y, true, 1, tile.tone, glyph)
              half(tile.cur, x, y, false, 1, tile.tone, glyph)
            } else if (p < 0.5) {
              // The old top flap folds down, revealing the new top behind it.
              half(tile.next, x, y, true, 1, tile.tone, glyph)
              half(tile.cur, x, y, false, 1, tile.tone, glyph)
              half(tile.cur, x, y, true, 1 - p * 2, tile.tone, glyph)
            } else {
              // The new bottom flap falls into place over the old bottom.
              half(tile.next, x, y, true, 1, tile.tone, glyph)
              half(tile.cur, x, y, false, 1, tile.tone, glyph)
              half(tile.next, x, y, false, (p - 0.5) * 2, tile.tone, glyph)
            }
            // The split, a hairline in the background colour.
            ctx.globalAlpha = theme.dark ? 0.8 : 0.5
            ctx.fillStyle = theme.dark ? "#000" : "#fff"
            ctx.fillRect(x + 2, y + CELL / 2 - 0.5, TILE_W - 4, 1)
          })
        })
      }
      ctx.globalAlpha = 1
    }

    const advance = (now: number) => {
      for (const b of boards)
        for (const r of b.rows)
          for (const tile of r.tiles) {
            if (tile.steps > 0 && now >= tile.stepAt + STEP_MS) {
              tile.cur = tile.next
              tile.steps -= 1
              tile.stepAt += STEP_MS
              tile.next = CHARSET[(CHARSET.indexOf(tile.cur) + 1) % CHARSET.length]!
            }
          }
    }

    build(performance.now())
    if (prefersStill()) {
      for (const b of boards)
        for (const r of b.rows)
          for (const t of r.tiles) {
            t.cur = t.target
            t.steps = 0
          }
      draw(0)
      return () => undefined
    }

    let frame = 0
    let last = 0
    let lastUpdate = performance.now() + 2500
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < 16) return
      last = now
      // Every couple of seconds a quote changes: sometimes the move, sometimes a new ticker.
      if (now - lastUpdate > 1800 && boards.length) {
        lastUpdate = now
        const b = boards[Math.floor(Math.random() * boards.length)]!
        const r = b.rows[Math.floor(Math.random() * b.rows.length)]!
        // A new ticker never duplicates one already on this board.
        const onBoard = new Set(b.rows.map((x) => x.quote.t))
        const fresh = POOL.filter((p) => !onBoard.has(p.t))
        const q =
          Math.random() < 0.6 || fresh.length === 0
            ? { t: r.quote.t, c: Math.round((r.quote.c + (Math.random() - 0.5) * 0.8) * 100) / 100 }
            : fresh[Math.floor(Math.random() * fresh.length)]!
        setRow(r, q, now)
      }
      advance(now)
      draw(now)
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") pointer = { x: e.clientX, y: e.clientY }
    }
    const onLeave = () => (pointer = null)
    const onResize = () => build(performance.now())
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
