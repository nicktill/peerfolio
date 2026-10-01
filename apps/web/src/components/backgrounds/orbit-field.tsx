"use client"

import { useEffect, useRef } from "react"
import { fitCanvas, moodFromUrl, prefersStill, readTheme, watchTheme } from "./canvas"

/**
 * DRAFT: Orbit. Your league as a small solar system, drawn with Neo-Geo
 * precision. Concentric orbits rise from below the page like the arcs of a
 * polar chart; each member sits on the ring of their rank (leader innermost)
 * and travels at a speed set by their return, so the hot hand visibly laps
 * the field. Your ring and planet are in brand green; faint radial spokes and
 * tick marks give it the feel of an instrument. Members are illustrative.
 */
const MEMBERS = [
  { name: "MC", ret: 7.29 },
  { name: "YOU", ret: 4.25, you: true },
  { name: "SO", ret: 3.39 },
  { name: "PR", ret: 1.12 },
  { name: "DE", ret: -2.41 },
  { name: "JL", ret: -11.15 },
]

export function OrbitField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const up = moodFromUrl() === "up"
    let theme = readTheme()
    let size = fitCanvas(canvas, ctx)
    const phase = MEMBERS.map((_, i) => 0.9 + i * 0.73)

    const draw = (t: number) => {
      const { w, h } = size
      const dark = theme.dark
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h * 1.18
      const r0 = h * 0.62
      const gap = Math.min(w, h) * 0.085

      // Spokes and degree ticks: the instrument.
      ctx.strokeStyle = theme.fg
      ctx.lineWidth = 1
      ctx.globalAlpha = dark ? 0.06 : 0.05
      ctx.beginPath()
      for (let a = -90; a <= 90; a += 7.5) {
        const rad = ((a - 90) * Math.PI) / 180
        ctx.moveTo(cx + Math.cos(rad) * r0 * 0.6, cy + Math.sin(rad) * r0 * 0.6)
        ctx.lineTo(cx + Math.cos(rad) * (r0 + gap * MEMBERS.length + 40), cy + Math.sin(rad) * (r0 + gap * MEMBERS.length + 40))
      }
      ctx.stroke()

      MEMBERS.forEach((m, i) => {
        const r = r0 + i * gap
        // The ring.
        ctx.globalAlpha = m.you ? (dark ? 0.4 : 0.32) : dark ? 0.12 : 0.1
        ctx.strokeStyle = m.you ? theme.brand : theme.fg
        ctx.lineWidth = m.you ? 1.5 : 1
        ctx.setLineDash(m.you ? [] : [2, 6])
        ctx.beginPath()
        ctx.arc(cx, cy, r, Math.PI, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])

        // The planet: speed from return, direction from its sign.
        const speed = 0.02 + Math.abs(m.ret) * 0.004
        const a = Math.PI * 1.08 + (((phase[i]! + t * speed * Math.sign(m.ret || 1)) % 0.84) + 0.84) % 0.84 * Math.PI
        const px = cx + Math.cos(a) * r
        const py = cy + Math.sin(a) * r
        const tone = m.you ? theme.brand : m.ret >= 0 ? theme.gain : theme.loss
        // A short trail behind it, the way a long exposure would catch it.
        ctx.globalAlpha = dark ? 0.35 : 0.28
        ctx.strokeStyle = tone
        ctx.lineWidth = m.you ? 2.5 : 1.75
        ctx.beginPath()
        ctx.arc(cx, cy, r, a - Math.sign(m.ret || 1) * 0.08, a, m.ret < 0)
        ctx.stroke()
        const pr = m.you ? 8 : 6
        ctx.globalAlpha = dark ? 0.18 : 0.14
        ctx.fillStyle = tone
        ctx.beginPath()
        ctx.arc(px, py, pr * 2.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = dark ? 0.9 : 0.8
        ctx.beginPath()
        ctx.arc(px, py, pr, 0, Math.PI * 2)
        ctx.fill()
        // Label: initials and return, set like an instrument readout.
        ctx.globalAlpha = m.you ? 0.75 : dark ? 0.5 : 0.45
        ctx.fillStyle = m.you ? theme.brand : theme.fg
        ctx.font = `600 10px ${theme.mono}`
        ctx.textAlign = "left"
        ctx.textBaseline = "middle"
        ctx.fillText(`${m.name} ${m.ret >= 0 ? "+" : ""}${m.ret.toFixed(1)}%`, px + pr + 8, py)
      })

      // Rank numerals along the left end of each ring.
      ctx.globalAlpha = dark ? 0.3 : 0.28
      ctx.fillStyle = theme.fg
      ctx.font = `500 10px ${theme.mono}`
      ctx.textAlign = "right"
      MEMBERS.forEach((_, i) => ctx.fillText(String(i + 1).padStart(2, "0"), cx - (r0 + i * gap) - 8, cy - 14))
      ctx.globalAlpha = 1
      void up
    }

    if (prefersStill()) {
      draw(0)
      return () => undefined
    }
    let raf = 0
    let last = 0
    const start = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - last < 33) return
      last = now
      draw((now - start) / 1000)
    }
    const onResize = () => (size = fitCanvas(canvas, ctx))
    const stop = watchTheme(() => (theme = readTheme()))
    window.addEventListener("resize", onResize)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      stop()
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10" />
}
