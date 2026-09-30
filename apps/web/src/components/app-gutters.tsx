"use client"

import { useEffect, useState } from "react"
import { cn } from "@web/lib/utils"

/**
 * DRAFT: three takes on filling the empty margins either side of the signed-in
 * content on wide screens. Fixed, non-interactive, behind everything, and only
 * present when each margin is wide enough to hold something (see .gutter).
 * Pick one and the other two get deleted.
 *   a  drifting reactions   b  market-pulse rails   c  group-chat banter
 */
export type GutterVariant = "a" | "b" | "c" | "off"

const REACTIONS = ["🔥", "🚀", "👏", "🧊", "😭", "🏆", "📈", "💎", "🤝", "😤", "🍿", "🫡"]
// Deterministic so server and client agree: left %, size px, seconds, offset seconds, blur px.
const FLOATERS = Array.from({ length: 14 }, (_, i) => ({
  emoji: REACTIONS[i % REACTIONS.length]!,
  x: (i * 37 + 11) % 82 + 4,
  size: 20 + ((i * 13) % 26),
  dur: 26 + ((i * 7) % 18),
  delay: -((i * 5.3) % 30),
  blur: i % 4 === 0 ? 2.5 : 0,
}))

const TICKS = [
  ["NVDA", "+2.14%"], ["VTI", "+0.31%"], ["AAPL", "-0.42%"], ["MSFT", "+0.88%"], ["BND", "-0.05%"],
  ["VXUS", "+0.17%"], ["TSLA", "-1.92%"], ["QQQ", "+0.54%"], ["AMZN", "+1.06%"], ["VOO", "+0.29%"],
  ["PLTR", "+3.41%"], ["HOOD", "-3.20%"],
] as const

const BANTER = [
  { from: "Maya", text: "NVDA carrying me rn 🚀", side: "left", top: "14%", tilt: "-rotate-3" },
  { from: "DeShawn", text: "index funds and chill 🧊", side: "right", top: "26%", tilt: "rotate-2" },
  { from: "Jordan", text: "who let me buy the dip again 😭", side: "left", top: "52%", tilt: "rotate-2" },
  { from: "Sam", text: "week 4 closes friday ⏰", side: "right", top: "64%", tilt: "-rotate-2" },
  { from: "Priya", text: "high conviction, high variance", side: "left", top: "82%", tilt: "-rotate-1" },
  { from: "Nick", text: "you took the lead 👑", side: "right", top: "86%", tilt: "rotate-3" },
] as const

function Sparkline({ up, seed }: { up: boolean; seed: number }) {
  const pts = Array.from({ length: 12 }, (_, i) => {
    const wobble = Math.sin(i * 1.7 + seed) * 4 + Math.cos(i * 0.9 + seed * 2) * 3
    const trend = (up ? -1 : 1) * i * 1.3
    return `${(i * 52) / 11},${(20 + trend + wobble).toFixed(1)}`
  })
  return (
    <svg viewBox="0 0 52 40" className="h-5 w-12" aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function Rail({ dir }: { dir: "up" | "down" }) {
  const rows = dir === "up" ? TICKS : [...TICKS].reverse()
  const list = [...rows, ...rows]
  return (
    <div className="gutter-mask h-full overflow-hidden">
      <ul className={cn("flex flex-col items-center gap-9 py-6", dir === "up" ? "gutter-scroll-up" : "gutter-scroll-down")}>
        {list.map(([ticker, change], i) => {
          const up = change.startsWith("+")
          return (
            <li key={i} className={cn("flex flex-col items-center gap-1 font-mono", up ? "text-gain-ink" : "text-loss-ink")}>
              <span className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground">{ticker}</span>
              <Sparkline up={up} seed={i} />
              <span className="text-xs font-semibold">{change}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function AppGutters({ variant = "a" }: { variant?: GutterVariant }) {
  // Drafts only: lets ?gutter=b etc. switch concepts without a rebuild.
  const [chosen, setChosen] = useState<GutterVariant>(variant)
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("gutter")
    if (param === "a" || param === "b" || param === "c" || param === "off") setChosen(param)
  }, [])

  if (chosen === "off") return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 hidden min-[1400px]:block">
      {chosen === "a" &&
        (["left", "right"] as const).map((side) => (
          <div key={side} className={cn("gutter absolute inset-y-0 overflow-hidden", side === "left" ? "left-0" : "right-0")}>
            {FLOATERS.filter((_, i) => (side === "left" ? i % 2 === 0 : i % 2 === 1)).map((f, i) => (
              <span
                key={i}
                className="gutter-rise absolute bottom-0 select-none"
                style={{
                  left: `${f.x}%`,
                  fontSize: f.size,
                  filter: f.blur ? `blur(${f.blur}px)` : undefined,
                  animationDuration: `${f.dur}s`,
                  animationDelay: `${f.delay}s`,
                  ["--y" as string]: `${(i * 23 + 9) % 80 + 5}%`,
                }}
              >
                {f.emoji}
              </span>
            ))}
          </div>
        ))}

      {chosen === "b" && (
        <>
          <div className="gutter absolute inset-y-0 left-0 opacity-[0.55]"><Rail dir="up" /></div>
          <div className="gutter absolute inset-y-0 right-0 opacity-[0.55]"><Rail dir="down" /></div>
        </>
      )}

      {chosen === "c" &&
        BANTER.map((b) => (
          <div key={b.from} className={cn("gutter absolute flex", b.side === "left" ? "left-0 justify-center" : "right-0 justify-center")} style={{ top: b.top }}>
            <div className={cn("float-y max-w-[14rem] rounded-2xl border bg-card/70 px-3.5 py-2.5 text-sm shadow-sm backdrop-blur-sm", b.tilt)} style={{ animationDelay: `${(b.top.length + b.from.length) % 5}s` }}>
              <p className="text-[11px] font-semibold text-muted-foreground">{b.from}</p>
              <p className="mt-0.5 leading-snug text-foreground/80">{b.text}</p>
            </div>
          </div>
        ))}
    </div>
  )
}
