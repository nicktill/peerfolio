"use client"

import { useEffect, useRef } from "react"
import { hexRgb, moodFromUrl, prefersStill, readTheme, watchTheme } from "./canvas"

/**
 * DRAFT: Atmosphere. Slow coloured gas behind the app: four or five large,
 * heavily blurred masses of the day's palette (greens, teals and blues when
 * you're up; reds, ambers and violets when you're down) drifting on paths
 * that take a minute or more, under a fine film grain. The cursor tows a
 * small cloud of brand light, and the masses shift as you scroll.
 *
 * Cheap on purpose: the masses are painted into a canvas an eighth of the
 * viewport's size and the browser blurs and stretches it on the GPU.
 */
const SCALE = 8

type Mass = { ax: number; ay: number; px: number; py: number; ph: number; r: number; rgb: [number, number, number]; a: number }

export function AtmosphereField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const up = moodFromUrl() === "up"
    let theme = readTheme()
    let scroll = window.scrollY
    const lamp = { x: 0.5, y: 0.3, tx: 0.5, ty: 0.3, s: 0, ts: 0 }

    const resize = () => {
      canvas.width = Math.ceil((window.innerWidth * 1.2) / SCALE)
      canvas.height = Math.ceil((window.innerHeight * 1.2) / SCALE)
    }
    resize()

    const palette = () => {
      const css = getComputedStyle(document.documentElement)
      const v = (n: string) => hexRgb(css.getPropertyValue(n).trim() || "#888888")
      return up
        ? [v("--gain"), v("--series-1"), v("--series-7"), v("--series-3"), v("--series-1")]
        : [v("--loss"), v("--series-2"), v("--series-5"), v("--series-7"), v("--series-2")]
    }
    const masses: Mass[] = palette().map((rgb, i) => ({
      ax: [0.32, 0.38, 0.3, 0.42, 0.25][i]!,
      ay: [0.26, 0.3, 0.34, 0.22, 0.28][i]!,
      px: [71, 93, 64, 107, 83][i]!,
      py: [88, 61, 97, 76, 115][i]!,
      ph: i * 1.9,
      r: [0.42, 0.36, 0.33, 0.3, 0.26][i]!,
      a: [1, 0.85, 0.8, 0.7, 0.6][i]!,
      rgb,
    }))
    const brand = () => {
      const [h, s, l] = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim().split(/\s+/).map(parseFloat)
      const a = ((s ?? 50) / 100) * Math.min((l ?? 40) / 100, 1 - (l ?? 40) / 100)
      const f = (n: number) => {
        const k = (n + (h ?? 160) / 30) % 12
        return Math.round(255 * ((l ?? 40) / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      }
      return [f(0), f(8), f(4)] as [number, number, number]
    }
    let lampRgb = brand()

    const draw = (t: number) => {
      const w = canvas.width
      const h = canvas.height
      const dark = theme.dark
      const diag = Math.hypot(w, h)
      const shift = ((scroll * 0.2) / SCALE) % (h * 3)
      ctx.globalCompositeOperation = "source-over"
      ctx.clearRect(0, 0, w, h)
      // Light on dark adds up like real glow; on paper it layers like watercolour.
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over"
      const blob = (x: number, y: number, r: number, rgb: [number, number, number], a: number) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`)
        g.addColorStop(0.55, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a * 0.35})`)
        g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`)
        ctx.fillStyle = g
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
      }
      const strength = dark ? 0.42 : 0.28
      for (const m of masses) {
        // Each mass also swells and shrinks a little, so the gas seems to breathe.
        const swell = 1 + 0.12 * Math.sin(t / (m.px * 0.37) + m.ph)
        const x = w * (0.5 + m.ax * Math.sin((t / m.px) * 2 * Math.PI + m.ph))
        const y = h * (0.42 + m.ay * Math.sin((t / m.py) * 2 * Math.PI + m.ph * 1.4)) - shift
        blob(x, y, m.r * diag * swell, m.rgb, strength * m.a)
      }
      if (lamp.s > 0.01) blob(lamp.x * w, lamp.y * h, diag * 0.16, lampRgb, (dark ? 0.35 : 0.22) * lamp.s)
      ctx.globalCompositeOperation = "source-over"
    }

    let raf = 0
    if (prefersStill()) {
      draw(30)
    } else {
      let last = 0
      const start = performance.now()
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick)
        if (now - last < 40) return
        last = now
        lamp.x += (lamp.tx - lamp.x) * 0.04
        lamp.y += (lamp.ty - lamp.y) * 0.04
        lamp.s += (lamp.ts - lamp.s) * 0.04
        draw((now - start) / 1000)
      }
      raf = requestAnimationFrame(tick)
    }

    // Pointer in canvas coordinates (the canvas overhangs the viewport by 10% each side).
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      lamp.tx = (e.clientX + window.innerWidth * 0.1) / (window.innerWidth * 1.2)
      lamp.ty = (e.clientY + window.innerHeight * 0.1) / (window.innerHeight * 1.2)
      lamp.ts = 1
    }
    const onLeave = () => (lamp.ts = 0)
    const onScroll = () => (scroll = window.scrollY)
    const stop = watchTheme(() => {
      theme = readTheme()
      const p = palette()
      masses.forEach((m, i) => (m.rgb = p[i]!))
      lampRgb = brand()
    })
    window.addEventListener("resize", resize)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("pointermove", onMove, { passive: true })
    document.addEventListener("pointerleave", onLeave)
    return () => {
      cancelAnimationFrame(raf)
      stop()
      window.removeEventListener("resize", resize)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerleave", onLeave)
    }
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <canvas ref={canvasRef} className="atmosphere-gas absolute -inset-[10%] h-[120%] w-[120%]" />
      <div className="atmosphere-grain absolute inset-0" />
    </div>
  )
}
