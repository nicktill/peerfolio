const CELL = 56

/** A seeded shuffle, so server and client draw the same cells. */
function cells(n: number) {
  let s = 20261011
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  const taken: [number, number][] = []
  const out: { x: number; y: number; delay: number; dur: number; peak: number }[] = []
  let guard = 0
  while (out.length < n && guard++ < 400) {
    const x = Math.floor(rand() * 21) // columns across the page, centred on the middle
    const y = Math.floor(rand() * 10)
    // Keep cells apart (no touching neighbours) so they read as scattered, not as a pattern.
    if (taken.some(([a, b]) => Math.abs(a - x) < 3 && Math.abs(b - y) < 3)) continue
    taken.push([x, y])
    out.push({ x, y, delay: -rand() * 14, dur: 8 + rand() * 9, peak: 0.05 + rand() * 0.06 })
  }
  return out
}
const LIT = cells(14)

/** Hairline grid paper, a scatter of softly lit cells in the accent blue, and two slow, faint hues behind. Pure CSS. */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="pf-hue absolute left-[8%] top-[-18%] h-[70%] w-[55%]" />
      <div className="pf-hue pf-hue-b absolute right-[2%] top-[4%] h-[60%] w-[45%]" />
      <div className="pf-grid absolute inset-0" />
      {LIT.map((c, i) => (
        <span
          key={i}
          className="pf-cell absolute hidden sm:block"
          style={{ width: CELL, height: CELL, left: `calc(50% + ${(c.x - 10) * CELL}px)`, top: c.y * CELL, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, ["--peak" as string]: c.peak }}
        />
      ))}
    </div>
  )
}
