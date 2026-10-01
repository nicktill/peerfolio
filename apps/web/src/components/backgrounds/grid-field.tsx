"use client"

import { useEffect, useRef } from "react"
import { cursorOff } from "./canvas"

/**
 * The landing page's graph paper, grown into a living background for the
 * signed-in app. Same 48px grid and the same lit cells, drawn on one canvas so
 * cells can react to the cursor, to clicks and to the market.
 *
 * DRAFT: three moods, picked by the \`mood\` prop (the background lab passes it).
 *   a  alive    cells kindle and fade on their own; the cursor leaves a trail
 *   b  market   single cells rise (you're up today) or sink (you're down) in
 *               gain/loss ink with a short fading trail, over the landing
 *               page's quiet blinking cells; nothing follows the cursor
 *   c  stadium  a diagonal wave sweeps the board like a scoreboard; clicks ripple out
 *
 * Cheap by construction: capped at 30fps, paused in background tabs, and with
 * reduced motion it draws once, still, like the landing page.
 */
export type GridMood = "a" | "b" | "c"

const CELL = 48
const FPS = 30

type Pulse = { i: number; start: number; dur: number }
type Spark = { col: number; row: number; next: number }
type Ring = { x: number; y: number; start: number }

const hsl = (triple: string) => {
  const [h, s, l] = triple.trim().split(/\s+/)
  return `hsl(${h}, ${s}, ${l})`
}

export function GridField({ mood: initialMood = "a" }: { mood?: GridMood }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const params = new URLSearchParams(window.location.search)
    const mood: GridMood = initialMood
    // Market mood direction; the dashboard will feed this from today's change.
    const up = params.get("mood") !== "down"
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    let cols = 0
    let rows = 0
    let offsetX = 0
    let energy = new Float32Array(0)
    let tint = new Uint8Array(0) // 0 brand, 1 gain, 2 loss
    let colors = { line: "#000", brand: "#000", gain: "#000", loss: "#000", max: 0.14 }

    const readColors = () => {
      const css = getComputedStyle(document.documentElement)
      const glow = parseFloat(css.getPropertyValue("--glow-a")) || 0.1
      colors = {
        line: hsl(css.getPropertyValue("--foreground")),
        brand: hsl(css.getPropertyValue("--primary")),
        gain: css.getPropertyValue("--gain").trim(),
        loss: css.getPropertyValue("--loss").trim(),
        max: glow * 1.5,
      }
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Centre a grid line on the page like the landing grid (background-position: center top).
      offsetX = ((w / 2) % CELL) - CELL
      cols = Math.ceil((w - offsetX) / CELL) + 1
      rows = Math.ceil(h / CELL) + 1
      energy = new Float32Array(cols * rows)
      tint = new Uint8Array(cols * rows)
    }

    const cellAt = (x: number, y: number) => ({ col: Math.floor((x - offsetX) / CELL), row: Math.floor(y / CELL) })
    const light = (col: number, row: number, value: number, t = 0) => {
      if (col < 0 || row < 0 || col >= cols || row >= rows) return
      const i = row * cols + col
      if (value > energy[i]!) {
        energy[i] = value
        tint[i] = t
      }
    }

    const draw = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      ctx.clearRect(0, 0, w, h)

      for (let i = 0; i < energy.length; i++) {
        const e = energy[i]!
        if (e < 0.01) continue
        const col = i % cols
        const row = (i - col) / cols
        ctx.globalAlpha = e * colors.max
        ctx.fillStyle = tint[i] === 1 ? colors.gain : tint[i] === 2 ? colors.loss : colors.brand
        ctx.fillRect(offsetX + col * CELL + 1, row * CELL + 1, CELL - 1, CELL - 1)
      }

      ctx.globalAlpha = 0.06
      ctx.strokeStyle = colors.line
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let c = 0; c <= cols; c++) {
        const x = Math.round(offsetX + c * CELL) + 0.5
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
      }
      for (let r = 0; r <= rows; r++) {
        const y = r * CELL + 0.5
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    readColors()
    resize()

    if (still) {
      // The landing page's constellation, frozen.
      for (const [c, r] of [[3, 2], [7, 1], [11, 3], [15, 2], [5, 5], [13, 6], [2, 7], [17, 5], [9, 7]] as const) light(c, r, 0.8)
      draw()
      const onResize = () => {
        resize()
        draw()
      }
      window.addEventListener("resize", onResize)
      return () => window.removeEventListener("resize", onResize)
    }

    const pulses: Pulse[] = []
    const sparks: Spark[] = []
    const rings: Ring[] = []
    let pointer: { x: number; y: number } | null = null
    let lastSpawn = 0
    let lastSpark = 0
    let frame = 0
    let last = 0

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < 1000 / FPS) return
      const dt = last ? Math.min(now - last, 100) : 16
      last = now

      // Everything lit cools off; this is what leaves trails behind the cursor and sparks.
      const decay = Math.exp(-dt / 900)
      for (let i = 0; i < energy.length; i++) energy[i]! *= decay

      // Ambient kindling, like the landing page's lit cells but never the same twice.
      const target = Math.round((cols * rows) / (mood === "a" ? 55 : mood === "b" ? 70 : 110))
      if (pulses.length < target && now - lastSpawn > 220) {
        lastSpawn = now
        pulses.push({ i: Math.floor(Math.random() * cols * rows), start: now, dur: 4000 + Math.random() * 3000 })
      }
      for (let k = pulses.length - 1; k >= 0; k--) {
        const p = pulses[k]!
        const t = (now - p.start) / p.dur
        if (t >= 1) {
          pulses.splice(k, 1)
          continue
        }
        const col = p.i % cols
        light(col, (p.i - col) / cols, Math.sin(Math.PI * t) * 0.85)
      }

      if (mood === "b") {
        // Sparks climb when you're up today and sink when you're down.
        if (now - lastSpark > 520) {
          lastSpark = now
          sparks.push({ col: Math.floor(Math.random() * cols), row: up ? rows : -1, next: now })
        }
        for (let k = sparks.length - 1; k >= 0; k--) {
          const s = sparks[k]!
          if (now >= s.next) {
            s.row += up ? -1 : 1
            s.next = now + 260
          }
          if (s.row < -1 || s.row > rows) sparks.splice(k, 1)
          // Softer than the brand cells: a down day should read as weather, not an alarm.
          else light(s.col, s.row, 0.7, up ? 1 : 2)
        }
      }

      if (mood === "c") {
        // A stadium wave: a diagonal band sweeps the board every ten seconds.
        const period = 10000
        const phase = (now % period) / period
        const band = phase * (cols + rows * 0.6 + 12) - 6
        if (phase < 0.75) {
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              const d = col + row * 0.6 - band
              if (d > -3 && d < 3) light(col, row, Math.exp(-(d * d) / 1.6) * 0.9)
            }
          }
        }
        // Click ripples: a ring of cells rushing outward and fading.
        for (let k = rings.length - 1; k >= 0; k--) {
          const ring = rings[k]!
          const age = (now - ring.start) / 1000
          if (age > 1.6) {
            rings.splice(k, 1)
            continue
          }
          const radius = age * 16
          const fade = 1 - age / 1.6
          const { col: cc, row: rr } = cellAt(ring.x, ring.y)
          const reach = Math.ceil(radius) + 1
          for (let row = rr - reach; row <= rr + reach; row++) {
            for (let col = cc - reach; col <= cc + reach; col++) {
              const off = Math.abs(Math.hypot(col - cc, row - rr) - radius)
              if (off < 0.9) light(col, row, (1 - off / 0.9) * fade)
            }
          }
        }
      }

      // The cursor warms the cells around it; they cool slowly after it leaves.
      if (pointer && mood !== "b") {
        const { col, row } = cellAt(pointer.x, pointer.y)
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const d = Math.hypot(dc, dr)
            if (d <= 2) light(col + dc, row + dr, (1 - d / 2.4) * 0.8)
          }
        }
      }

      draw()
    }

    const onMove = (event: PointerEvent) => {
      if (cursorOff()) return
      if (event.pointerType === "mouse") pointer = { x: event.clientX, y: event.clientY }
    }
    const onLeave = () => (pointer = null)
    const onDown = (event: PointerEvent) => {
      if (mood === "c") rings.push({ x: event.clientX, y: event.clientY, start: performance.now() })
    }
    const themeObserver = new MutationObserver(readColors)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] })

    window.addEventListener("resize", resize)
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerdown", onDown, { passive: true })
    document.addEventListener("pointerleave", onLeave)
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      themeObserver.disconnect()
      window.removeEventListener("resize", resize)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerdown", onDown)
      document.removeEventListener("pointerleave", onLeave)
    }
  }, [initialMood])

  return <canvas ref={canvasRef} aria-hidden className="grid-field pointer-events-none fixed inset-0 -z-10" />
}

/** The two grid designs offered in Settings, as standalone components for lazy loading. */
export function AliveGrid() {
  return <GridField mood="a" />
}

export function MarketGrid() {
  return <GridField mood="b" />
}
