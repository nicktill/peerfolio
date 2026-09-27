/** Grid paper, a few lit cells and two soft glows behind the hero. Pure CSS. */
const LIT = [
  [3, 2], [7, 1], [11, 3], [15, 2], [5, 5], [13, 6], [2, 7], [17, 5], [9, 7],
] as const

export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="hero-grid absolute inset-0" />
      {LIT.map(([x, y], i) => (
        <span
          key={i}
          className="grid-cell absolute size-12 bg-primary/15"
          style={{ left: `calc(50% + ${(x - 10) * 48}px)`, top: y * 48, animationDelay: `${i * 0.7}s` }}
        />
      ))}
      <div className="absolute -top-24 left-[10%] size-[28rem] rounded-full bg-primary/20 blur-3xl dark:bg-primary/15" />
      <div className="absolute right-[5%] top-40 size-[22rem] rounded-full bg-[var(--series-1)]/15 blur-3xl" />
    </div>
  )
}
