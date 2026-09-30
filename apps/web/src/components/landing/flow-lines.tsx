/**
 * Faint flowing lines behind the closing call to action: the league race chart
 * turned into ambient texture. Static SVG, nothing to hydrate.
 */
const LINES = Array.from({ length: 9 }, (_, i) => {
  const lift = i * 9
  const amp = 26 + i * 3
  return `M0 ${150 - lift} C 220 ${150 - lift - amp}, 360 ${150 - lift + amp}, 600 ${140 - lift} S 980 ${120 - lift - amp}, 1200 ${100 - lift}`
})

export function FlowLines() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1200 200"
      preserveAspectRatio="none"
      className="flow-lines pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-64 w-full text-primary"
    >
      {LINES.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity={0.55 - i * 0.045} />
      ))}
    </svg>
  )
}
