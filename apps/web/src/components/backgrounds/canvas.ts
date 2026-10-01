/**
 * Shared plumbing for the canvas backgrounds behind the signed-in app: theme
 * colours read from the CSS tokens (so light/dark and any palette change carry
 * over), a DPR-aware resize, and the grid geometry every background snaps to.
 */
export const CELL = 48

export type Theme = { fg: string; brand: string; gain: string; loss: string; glow: number; mono: string; dark: boolean }

const hsl = (triple: string) => {
  const [h, s, l] = triple.trim().split(/\s+/)
  return `hsl(${h}, ${s}, ${l})`
}

export function readTheme(): Theme {
  const css = getComputedStyle(document.documentElement)
  return {
    fg: hsl(css.getPropertyValue("--foreground")),
    brand: hsl(css.getPropertyValue("--primary")),
    gain: css.getPropertyValue("--gain").trim(),
    loss: css.getPropertyValue("--loss").trim(),
    glow: parseFloat(css.getPropertyValue("--glow-a")) || 0.1,
    mono: css.getPropertyValue("--font-geist-mono").trim() || "ui-monospace, monospace",
    dark: document.documentElement.classList.contains("dark"),
  }
}

/** Sizes the canvas to the viewport at device resolution; returns CSS-pixel size. */
export function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { w, h }
}

/** Grid lines centred on the page, like the landing grid (background-position: center top). */
export const gridOffsetX = (w: number) => ((w / 2) % CELL) - CELL

export function strokeGrid(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, alpha: number) {
  const ox = gridOffsetX(w)
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = ox; x <= w + CELL; x += CELL) {
    ctx.moveTo(Math.round(x) + 0.5, 0)
    ctx.lineTo(Math.round(x) + 0.5, h)
  }
  for (let y = 0; y <= h; y += CELL) {
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(w, y + 0.5)
  }
  ctx.stroke()
  ctx.globalAlpha = 1
}

export const prefersStill = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Re-read colours whenever the theme class flips. */
export function watchTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] })
  return () => observer.disconnect()
}

/** Columns fully outside the centred max-w-6xl content (72rem + 2rem padding) on each side. */
export function gutterCols(w: number) {
  const content = Math.min(w, 1184)
  const edge = (w - content) / 2
  const ox = gridOffsetX(w)
  return Math.max(0, Math.floor((edge - ox) / CELL))
}

/** Today's direction for the mood-aware backgrounds. Drafts read ?mood=; the app will pass the real daily change. */
export const moodFromUrl = (): "up" | "down" => (new URLSearchParams(window.location.search).get("mood") === "down" ? "down" : "up")

/** "#1baf7a" -> [27, 175, 122] */
export function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Side margins as pixel ranges, with the whole-cell columns each one holds. */
export function gutters(w: number) {
  const g = gutterCols(w)
  const ox = gridOffsetX(w)
  const cols = Math.ceil((w - ox) / CELL)
  return {
    g,
    cols,
    left: { from: 1, to: g }, // column 0 is partly off-screen
    right: { from: cols - g, to: cols - 1 },
  }
}

/** True when the viewer turned "Interactive" off: designs keep moving but ignore the cursor. */
export const cursorOff = () => document.documentElement.dataset.bgStill === "1"
