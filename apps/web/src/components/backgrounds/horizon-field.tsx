"use client"

import { useEffect, useRef } from "react"
import { CELL, fitCanvas, moodFromUrl, prefersStill, readTheme, watchTheme } from "./canvas"

/**
 * DRAFT: Horizon. Your market as a landscape at the edge of the day.
 *
 * - The sun is today: on an up day it has risen clear of the ridge, warm with
 *   gain light; on a down day it is setting, low and red, half behind the hills.
 * - Three ranges recede into haze: the back one is your 3-month return, the
 *   middle your month, the front your week, which ends in a glowing "today"
 *   dot labelled with the return. Farther ranges are paler (atmospheric
 *   perspective), so the eye reads depth without being told.
 * - The checker grid becomes the floor, gliding toward you and catching the
 *   sun's reflection. Scrolling pushes you forward; the cursor pans the view,
 *   near layers more than far ones.
 *
 * Series are illustrative; wired up they are the viewer's own returns.
 */
function series(seed: number, n: number, drift: number, vol: number) {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const pts = [100]
  for (let i = 1; i < n; i++) pts.push(pts[i - 1]! * (1 + drift + (rnd() - 0.5) * vol))
  return pts
}

const STARS = Array.from({ length: 90 }, (_, i) => ({
  x: ((i * 7919) % 1000) / 1000,
  y: ((i * 104729) % 1000) / 1000,
  r: i % 11 === 0 ? 1.3 : 0.7,
  tw: (i * 37) % 100,
}))

export function HorizonField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const up = moodFromUrl() === "up"
    const sign = up ? 1 : -1
    const ranges = [
      { pts: series(5, 90, 0.0012 * sign, 0.024), height: 0.24, depth: 0.15, alpha: 0.35 },
      { pts: series(9, 30, 0.0016 * sign, 0.03), height: 0.17, depth: 0.45, alpha: 0.6 },
      { pts: series(13, 35, 0.0012 * sign, 0.016), height: 0.11, depth: 1, alpha: 1 },
    ]
    const week = ranges[2]!.pts
    const weekReturn = (week[week.length - 1]! / week[0]! - 1) * 100

    let theme = readTheme()
    // The page's own background, so haze and mist melt into it exactly.
    const readBg = () => (getComputedStyle(document.body).backgroundColor.match(/\d+/g) ?? ["250", "250", "249"]).slice(0, 3).join(",")
    let bgRgb = readBg()
    let size = fitCanvas(canvas, ctx)
    let travel = 0
    let lastScroll = window.scrollY
    const cam = { x: 0, tx: 0 }

    const ridgePath = (pts: number[], x0: number, x1: number, base: number, height: number) => {
      const lo = Math.min(...pts)
      const hi = Math.max(...pts)
      const step = (x1 - x0) / (pts.length - 1)
      const yAt = (v: number) => base - 6 - ((v - lo) / (hi - lo || 1)) * height
      const path = new Path2D()
      path.moveTo(x0 - 40, base)
      path.lineTo(x0, yAt(pts[0]!))
      for (let i = 1; i < pts.length; i++) {
        const px = x0 + (i - 1) * step
        const x = x0 + i * step
        path.bezierCurveTo(px + step / 2, yAt(pts[i - 1]!), x - step / 2, yAt(pts[i]!), x, yAt(pts[i]!))
      }
      const close = (p: Path2D) => {
        p.lineTo(x1 + 40, base)
        p.closePath()
      }
      return { path, end: { x: x1, y: yAt(pts[pts.length - 1]!) }, close }
    }

    const draw = (t: number) => {
      const { w, h } = size
      const dark = theme.dark
      const horizon = Math.round(h * 0.62)
      const tone = up ? theme.gain : theme.loss
      const bg = bgRgb
      ctx.clearRect(0, 0, w, h)

      // Sky: the light gathers toward the horizon in the day's colour.
      const sky = ctx.createLinearGradient(0, 0, 0, horizon)
      sky.addColorStop(0, "transparent")
      sky.addColorStop(1, tone)
      ctx.globalAlpha = dark ? 0.16 : 0.1
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, horizon)

      if (dark) {
        ctx.fillStyle = theme.fg
        for (const s of STARS) {
          const tw = 0.5 + 0.5 * Math.sin(t * 0.5 + s.tw)
          ctx.globalAlpha = 0.2 * (0.35 + 0.65 * tw) * (1 - s.y * 0.6)
          ctx.beginPath()
          ctx.arc(s.x * w, s.y * horizon * 0.8, s.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // The sun: risen on an up day, setting on a down day. Banded like an old poster.
      const sunR = Math.min(w, h) * 0.11
      // The sun stands in the right margin, beside the "today" point, where it can be seen.
      const sunX = w * 0.85 + cam.x * 0.15
      const sunY = horizon - (up ? sunR * 1.15 : sunR * 0.35) + Math.sin(t * 0.25) * 3
      const halo = ctx.createRadialGradient(sunX, sunY, sunR * 0.6, sunX, sunY, sunR * 4)
      halo.addColorStop(0, tone)
      halo.addColorStop(1, "transparent")
      ctx.globalAlpha = dark ? 0.22 : 0.12
      ctx.fillStyle = halo
      ctx.fillRect(0, 0, w, horizon + 40)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, w, horizon)
      ctx.clip()
      ctx.beginPath()
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2)
      ctx.clip()
      const disc = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR)
      disc.addColorStop(0, dark ? "rgba(255,255,255,0.9)" : tone)
      disc.addColorStop(1, tone)
      ctx.globalAlpha = dark ? 0.4 : 0.3
      ctx.fillStyle = disc
      ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2)
      // Bands cut through the lower half, thicker toward the bottom; they drift down slowly.
      ctx.globalCompositeOperation = "destination-out"
      ctx.globalAlpha = 1
      const drift = (t * 6) % 18
      for (let k = 0; k < 8; k++) {
        const y = sunY + k * 18 + drift
        const thick = 1 + k * 1.2
        if (y > sunY - 4) ctx.fillRect(sunX - sunR, y, sunR * 2, thick)
      }
      ctx.restore()
      ctx.globalCompositeOperation = "source-over"

      // Ranges, back to front, each paler than the one before it.
      let front: { x: number; y: number } | null = null
      ranges.forEach((r, idx) => {
        const pan = cam.x * r.depth
        const x0 = -w * 0.06 + pan
        const x1 = idx === 2 ? w * 0.93 + pan : w * 1.05 + pan
        const ridge = ridgePath(r.pts, x0, x1, horizon, h * r.height)
        const fill = new Path2D(ridge.path)
        ridge.close(fill)
        // Fill fades to background at the base: haze between ranges.
        const g = ctx.createLinearGradient(0, horizon - h * r.height, 0, horizon)
        g.addColorStop(0, `rgba(${bg},1)`)
        g.addColorStop(1, `rgba(${bg},0.6)`)
        ctx.globalAlpha = 0.9
        ctx.fillStyle = g
        ctx.fill(fill)
        const tint = ctx.createLinearGradient(0, horizon - h * r.height, 0, horizon)
        tint.addColorStop(0, tone)
        tint.addColorStop(1, "transparent")
        ctx.globalAlpha = (dark ? 0.12 : 0.08) * r.alpha
        ctx.fillStyle = tint
        ctx.fill(fill)
        ctx.globalAlpha = (dark ? 0.6 : 0.5) * r.alpha
        ctx.strokeStyle = tone
        ctx.lineWidth = idx === 2 ? 1.75 : 1.1
        ctx.stroke(ridge.path)
        if (idx === 2) front = ridge.end
      })

      // Today: a glowing point at the end of the front ridge, with the week's return.
      if (front) {
        const { x, y } = front as { x: number; y: number }
        const pulse = 0.5 + 0.5 * Math.sin(t * 2)
        ctx.globalAlpha = (dark ? 0.25 : 0.18) * (0.6 + 0.4 * pulse)
        ctx.fillStyle = tone
        ctx.beginPath()
        ctx.arc(x, y, 9 + pulse * 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = dark ? 0.95 : 0.85
        ctx.beginPath()
        ctx.arc(x, y, 3.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = dark ? 0.7 : 0.65
        ctx.font = `600 11px ${theme.mono}`
        ctx.textAlign = "center"
        ctx.textBaseline = "bottom"
        ctx.fillText(`${weekReturn >= 0 ? "+" : ""}${weekReturn.toFixed(2)}%`, x, y - 16)
        ctx.globalAlpha = dark ? 0.4 : 0.4
        ctx.fillStyle = theme.fg
        ctx.font = `500 9px ${theme.mono}`
        ctx.fillText("THIS WEEK", x, y - 30)
      }

      // Floor: the grid in perspective, gliding toward you.
      const depth = h - horizon
      const vx = w / 2 + cam.x
      const offset = (travel / CELL) % 1
      ctx.lineWidth = 1
      for (let k = 0; k < 28; k++) {
        const z = k + 1 - offset
        const y = horizon + depth / (z * 0.9)
        if (y > h + 2 || y < horizon) continue
        const near = Math.min(1, (y - horizon) / (depth * 0.35))
        ctx.globalAlpha = (dark ? 0.15 : 0.12) * near
        ctx.strokeStyle = theme.fg
        ctx.beginPath()
        ctx.moveTo(0, Math.round(y) + 0.5)
        ctx.lineTo(w, Math.round(y) + 0.5)
        ctx.stroke()
      }
      ctx.globalAlpha = dark ? 0.12 : 0.1
      ctx.beginPath()
      for (let k = -24; k <= 24; k++) {
        ctx.moveTo(vx + k * 5, horizon)
        ctx.lineTo(vx + k * CELL * 4.2, h)
      }
      ctx.stroke()

      // The sun's reflection on the floor.
      const refl = ctx.createLinearGradient(0, horizon, 0, h)
      refl.addColorStop(0, tone)
      refl.addColorStop(1, "transparent")
      ctx.globalAlpha = dark ? 0.14 : 0.08
      ctx.fillStyle = refl
      ctx.beginPath()
      ctx.moveTo(sunX - sunR * 0.5, horizon)
      ctx.lineTo(sunX + sunR * 0.5, horizon)
      ctx.lineTo(sunX + sunR * 1.6, h)
      ctx.lineTo(sunX - sunR * 1.6, h)
      ctx.closePath()
      ctx.fill()

      // Mist where floor meets sky.
      const mist = ctx.createLinearGradient(0, horizon - 10, 0, horizon + depth * 0.22)
      mist.addColorStop(0, `rgba(${bg},0.9)`)
      mist.addColorStop(1, `rgba(${bg},0)`)
      ctx.globalAlpha = 1
      ctx.fillStyle = mist
      ctx.fillRect(0, horizon - 10, w, depth * 0.22 + 10)
      ctx.globalAlpha = dark ? 0.35 : 0.3
      ctx.strokeStyle = tone
      ctx.beginPath()
      ctx.moveTo(0, horizon + 0.5)
      ctx.lineTo(w, horizon + 0.5)
      ctx.stroke()
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
      travel += dt * 0.011
      cam.x += (cam.tx - cam.x) * 0.05
      draw((now - start) / 1000)
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") cam.tx = (e.clientX / size.w - 0.5) * -70
    }
    const onScroll = () => {
      const y = window.scrollY
      travel += (y - lastScroll) * 0.5
      lastScroll = y
    }
    const onResize = () => (size = fitCanvas(canvas, ctx))
    const stop = watchTheme(() => {
      theme = readTheme()
      // The body background transitions after the class flips; read it once it settles.
      requestAnimationFrame(() => (bgRgb = readBg()))
    })
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
