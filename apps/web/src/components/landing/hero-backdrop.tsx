/** Hairline grid paper and a couple of barely-lit cells behind the hero. Pure CSS. */
const LIT = [
  [3, 1], [15, 2],
] as const
const CELL = 56

export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="pf-grid absolute inset-0" />
      {LIT.map(([x, y], i) => (
        <span
          key={i}
          className="pf-cell absolute hidden sm:block"
          style={{ width: CELL, height: CELL, left: `calc(50% + ${(x - 10) * CELL}px)`, top: y * CELL, animationDelay: `${i * 2.2}s` }}
        />
      ))}
    </div>
  )
}
