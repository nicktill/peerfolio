"use client"

import { useEffect, useRef } from "react"
import { CELL, fitCanvas, moodFromUrl, prefersStill, readTheme, watchTheme } from "./canvas"

/**
 * DRAFT: Horizon. Refined retro-futurism: the checker grid becomes a floor
 * receding to a horizon, gliding slowly toward you, and on that horizon stands
 * a ridge drawn from your return over the last 30 days. A low sun of mood
 * colour glows behind the ridge; a few faint stars sit above. The camera eases
 * a little toward the cursor, and scrolling the page pushes you forward.
 *
 * The ridge series is illustrative; wired up it is the viewer's own chart.
 */
const RIDGE = (() => {
  let s = 11
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const pts = [100]
  for (let i = 1; i < 30; i++) pts.push(pts[i - 1]! * (1 + 0.0026 + (rnd() - 0.5) * 0.022))
  return pts
})()

const STARS = Array.from({ length: 70 }, (_, i) => ({
  x: ((i * 7919) % 1000) / 1000,
  y: ((i * 104729) % 1000) / 1000,
  r: i % 9 === 0 ? 1.4 : 0.8,
  tw: (i * 37) % 100,
}))

export function HorizonField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const up = moodFromUrl() === "up"
    let theme = readTheme()
    let size = fitCanvas(canvas, ctx)
    let travel = 0
    let lastScroll = window.scrollY
    const cam = { x: 0, tx: 0 }

    const draw = (t: number) => {
      const { w, h } = size
      const horizon = Math.round(h * 0.6)
      const vx = w / 2 + cam.x
      const tone = up ? theme.gain : theme.loss
      ctx.clearRect(0, 0, w, h)

      // Sky: faint stars that twinkle slowly.
      ctx.fillStyle = theme.fg
      for (const s of STARS) {
        const tw = 0.5 + 0.5 * Math.sin(t * 0.6 + s.tw)
        ctx.globalAlpha = (theme.dark ? 0.22 : 0.12) * (0.4 + 0.6 * tw)
        ctx.beginPath()
        ctx.arc(s.x * w, s.y * horizon * 0.85, s.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // The low sun behind the ridge.
      const sun = ctx.createRadialGradient(vx, horizon, 0, vx, horizon, w * 0.42)
      sun.addColorStop(0, tone)
      sun.addColorStop(1, "transparent")
      ctx.globalAlpha = theme.dark ? 0.28 : 0.16
      ctx.fillStyle = sun
      ctx.fillRect(0, 0, w, h)

      // Ridge: the return series as a mountain range across the horizon.
      const lo = Math.min(...RIDGE)
      const hi = Math.max(...RIDGE)
      const ridgeH = h * 0.16
      const step = (w * 1.1) / (RIDGE.length - 1)
      const x0 = -w * 0.05 + cam.x * 0.4
      const yAt = (v: number) => horizon - 8 - ((v - lo) / (hi - lo || 1)) * ridgeH
      ctx.beginPath()
      ctx.moveTo(x0, horizon)
      RIDGE.forEach((v, i) => {
        const x = x0 + i * step
        const y = yAt(v)
        if (i === 0) ctx.lineTo(x, y)
        else {
          const px = x0 + (i - 1) * step
          const py = yAt(RIDGE[i - 1]!)
          ctx.bezierCurveTo(px + step / 2, py, x - step / 2, y, x, y)
        }
      })
      ctx.lineTo(x0 + (RIDGE.length - 1) * step, horizon)
      ctx.closePath()
      const fill = ctx.createLinearGradient(0, horizon - ridgeH, 0, horizon)
      fill.addColorStop(0, tone)
      fill.addColorStop(1, "transparent")
      ctx.globalAlpha = theme.dark ? 0.16 : 0.1
      ctx.fillStyle = fill
      ctx.fill()
      ctx.globalAlpha = theme.dark ? 0.55 : 0.45
      ctx.strokeStyle = tone
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Floor: the grid in perspective, gliding toward the viewer.
      const depth = h - horizon
      ctx.strokeStyle = theme.fg
      ctx.lineWidth = 1
      // Horizontal lines bunch toward the horizon (1/z spacing).
      const offset = (travel / CELL) % 1
      for (let k = 0; k < 26; k++) {
        const z = k + 1 - offset
        const y = horizon + depth / z
        if (y > h + 2) continue
        ctx.globalAlpha = (theme.dark ? 0.16 : 0.13) * Math.min(1, (y - horizon) / (depth * 0.25))
        ctx.beginPath()
        ctx.moveTo(0, Math.round(y) + 0.5)
        ctx.lineTo(w, Math.round(y) + 0.5)
        ctx.stroke()
      }
      // Rails converge on the vanishing point.
      ctx.globalAlpha = theme.dark ? 0.14 : 0.11
      ctx.beginPath()
      for (let k = -22; k <= 22; k++) {
        const xb = vx + k * CELL * 2.4
        ctx.moveTo(vx + k * 6, horizon)
        ctx.lineTo(vx + (xb - vx) * 1.9, h)
      }
      ctx.stroke()
      // A haze where floor meets sky, so the floor fades into distance.
      const haze = ctx.createLinearGradient(0, horizon, 0, horizon + depth * 0.25)
      haze.addColorStop(0, theme.dark ? "rgba(17,17,16,1)" : "rgba(250,250,249,1)")
      haze.addColorStop(1, "transparent")
      ctx.globalAlpha = 0.85
      ctx.fillStyle = haze
      ctx.fillRect(0, horizon, w, depth * 0.25)
      ctx.globalAlpha = 1
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
      const dt = last ? Math.min(now - last, 100) : 16
      last = now
      travel += dt * 0.012
      cam.x += (cam.tx - cam.x) * 0.05
      draw((now - start) / 1000)
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") cam.tx = (e.clientX / size.w - 0.5) * -60
    }
    // Scrolling pushes you forward (or back) along the floor.
    const onScroll = () => {
      const y = window.scrollY
      travel += (y - lastScroll) * 0.5
      lastScroll = y
    }
    const onResize = () => (size = fitCanvas(canvas, ctx))
    const stop = watchTheme(() => (theme = readTheme()))
    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("pointermove", onMove, { passive: true })
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      stop()
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("pointermove", onMove)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10" />
}
