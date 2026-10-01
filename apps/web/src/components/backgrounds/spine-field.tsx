"use client"

import { useEffect, useRef } from "react"
import { fitCanvas, gutters, gridOffsetX, CELL, moodFromUrl, prefersStill, readTheme, watchTheme } from "./canvas"

/**
 * DRAFT: Spine. Editorial, type-first: each side margin carries a magazine
 * spine of enormous outlined type, set vertically and cropped by the page
 * edge. The left spine is your number this month, the right your standing in
 * the league. A soft fill of the day's colour rises through the letters like
 * ink; small folio text (issue, date, section) sits beside them in mono, the
 * way a cover credits its contents. Values are illustrative.
 */
export function SpineField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const up = moodFromUrl() === "up"
    let theme = readTheme()
    let size = fitCanvas(canvas, ctx)
    const display = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "sans-serif"

    const spine = (text: string, x: number, width: number, side: "left" | "right", fillLevel: number, t: number) => {
      const { h } = size
      const dark = theme.dark
      const tone = up ? theme.gain : theme.loss
      // Size the type to the margin, then let it run off the bottom of the page.
      const fs = Math.min(width * 0.92, h * 0.34)
      ctx.save()
      // Keep the type in its own margin; it never runs under the content.
      ctx.beginPath()
      ctx.rect(x, 0, width, h)
      ctx.clip()
      ctx.translate(side === "left" ? x + width / 2 + fs * 0.36 : x + width / 2 - fs * 0.36, h * 0.08)
      ctx.rotate(side === "left" ? Math.PI / 2 : Math.PI / 2)
      ctx.font = `800 ${fs}px ${display}`
      ctx.textBaseline = "alphabetic"
      ctx.textAlign = "left"
      const tw = ctx.measureText(text).width
      // Ink: a gradient that rises through the letters to today's level, breathing slightly.
      const level = fillLevel + Math.sin(t * 0.5) * 0.02
      const ink = ctx.createLinearGradient(0, 0, tw, 0)
      ink.addColorStop(0, "transparent")
      ink.addColorStop(Math.max(0, level - 0.25), "transparent")
      ink.addColorStop(level, tone)
      ink.addColorStop(1, tone)
      ctx.globalAlpha = dark ? 0.16 : 0.12
      ctx.fillStyle = ink
      ctx.fillText(text, 0, 0)
      ctx.globalAlpha = dark ? 0.2 : 0.16
      ctx.strokeStyle = theme.fg
      ctx.lineWidth = 1.2
      ctx.strokeText(text, 0, 0)
      ctx.restore()
    }

    const folio = (lines: string[], x: number, y: number, align: CanvasTextAlign) => {
      ctx.fillStyle = theme.fg
      ctx.font = `500 10px ${theme.mono}`
      ctx.textAlign = align
      ctx.textBaseline = "top"
      lines.forEach((l, i) => {
        ctx.globalAlpha = i === 0 ? 0.55 : 0.32
        ctx.fillText(l, x, y + i * 16)
      })
    }

    const draw = (t: number) => {
      const { w, h } = size
      ctx.clearRect(0, 0, w, h)
      const { g, left, right } = gutters(w)
      const ox = gridOffsetX(w)
      if (g < 3) return
      const lx = ox + left.from * CELL
      const rx = ox + right.from * CELL
      const gw = (left.to - left.from + 1) * CELL
      spine(up ? "+4.25%" : "−2.55%", lx, gw, "left", up ? 0.55 : 0.8, t)
      spine("No.3", rx, gw, "right", 0.5, t)
      folio(["PORTFOLIO", "THIS MONTH", "VOL. 01 — OCT 2026"], lx + 8, h - 74, "left")
      folio(["THE GROUP CHAT", "RANK OF 5", "SEASON TWO"], rx + gw - 8, h - 74, "right")
      // A hairline rule under each folio, like a printed page.
      ctx.globalAlpha = 0.18
      ctx.strokeStyle = theme.fg
      ctx.beginPath()
      ctx.moveTo(lx + 8, h - 84.5)
      ctx.lineTo(lx + gw - 16, h - 84.5)
      ctx.moveTo(rx + 16, h - 84.5)
      ctx.lineTo(rx + gw - 8, h - 84.5)
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
      if (now - last < 50) return
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
