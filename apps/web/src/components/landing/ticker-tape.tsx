import { DEMO_STANDINGS } from "@web/components/landing/demo"
import { Marquee } from "@web/components/magicui/marquee"

const EVENTS = [
  ...DEMO_STANDINGS.map((s) => ({
    label: (s.name?.split(" ")[0] ?? "").toUpperCase(),
    value: s.percent,
  })),
]
const CHATTER = ["You took the lead 👑", "DeShawn is holding strong 🧊", "Jordan bought the dip. Again. 😤", "Sam moved up to #3", "Week 4 closes Friday ⏰"]

/** Scoreboard crawl of league moves. Still with reduced motion. */
export function TickerTape() {
  const items = EVENTS.flatMap((e, i) => [
    <span key={`e${i}`} className="numeric font-mono text-xs font-semibold">
      <span className="text-muted-foreground">{e.label}</span>{" "}
      <span style={{ color: e.value >= 0 ? "var(--gain)" : "var(--loss)" }}>
        {e.value >= 0 ? "▲" : "▼"} {e.value >= 0 ? "+" : "−"}
        {Math.abs(e.value).toFixed(1)}%
      </span>
    </span>,
    <span key={`c${i}`} className="text-xs text-muted-foreground">
      {CHATTER[i % CHATTER.length]}
    </span>,
  ])

  return (
    <div className="relative overflow-hidden border-y bg-card/60 py-3 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
      {/* Magic UI's Marquee; it slows to a stop under the cursor. */}
      <Marquee pauseOnHover repeat={4} className="p-0 [--duration:55s] [--gap:2.5rem]">
        {items}
      </Marquee>
    </div>
  )
}
