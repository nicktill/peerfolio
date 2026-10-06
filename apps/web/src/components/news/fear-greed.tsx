"use client"

import { useEffect, useState } from "react"
import { AnimatedNumber } from "@web/components/ui/animated-number"
import { Gauge } from "lucide-react"
import { SectionCard } from "@web/components/ui/section-card"
import { cn } from "@web/lib/utils"

const BANDS = [
  { from: 0, to: 25, label: "Extreme fear", stroke: "var(--loss)", tone: "loss" },
  { from: 25, to: 45, label: "Fear", stroke: "color-mix(in srgb, var(--loss) 50%, hsl(var(--border)))", tone: "loss" },
  { from: 45, to: 55, label: "Neutral", stroke: "hsl(var(--muted-foreground))", tone: "flat" },
  { from: 55, to: 75, label: "Greed", stroke: "color-mix(in srgb, var(--gain) 55%, hsl(var(--border)))", tone: "gain" },
  { from: 75, to: 100, label: "Extreme greed", stroke: "var(--gain)", tone: "gain" },
] as const

const bandOf = (score: number) => BANDS.findIndex((b) => score < b.to || b.to === 100)

const CX = 120
const CY = 120
const R = 100

function point(score: number, r = R) {
  const a = Math.PI * (1 - score / 100)
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)] as const
}

function arc(from: number, to: number) {
  const [x0, y0] = point(from)
  const [x1, y1] = point(to)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

const TONE_TEXT = { loss: "text-loss-ink", gain: "text-gain-ink", flat: "text-muted-foreground" }
const TONE_BOX = { loss: "tint-loss text-loss-ink", gain: "tint-gain text-gain-ink", flat: "bg-muted text-foreground" }

/**
 * A half-dial gauge. On arrival the needle swings up from zero with a little
 * overshoot and the score counts up alongside it, so the reading lands rather
 * than just appearing.
 */
export function FearGreed({ score, history, index }: { score: number; history: { label: string; score: number }[]; index: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(score))
    return () => cancelAnimationFrame(frame)
  }, [score])

  const active = bandOf(score)
  const band = BANDS[active]!

  return (
    <SectionCard label="Fear & Greed" icon={<Gauge />} tone="amber" index={index} action={<span className="pr-2 text-xs text-muted-foreground">Updated daily</span>}>
      <div className="relative flex flex-col items-center px-5 pb-1.5 pt-5">
        {/* A soft wash in the reading's colour behind the dial. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-[background] duration-700"
          style={{ background: `radial-gradient(16rem 9rem at 50% 75%, color-mix(in srgb, ${band.stroke} 22%, transparent), transparent 70%)` }}
        />
        <svg viewBox="0 0 240 132" className="relative block h-auto w-full max-w-[280px]" role="img" aria-label={`Fear and Greed index ${score} out of 100, ${band.label}`}>
          {BANDS.map((b, i) => (
            <path
              key={b.label}
              d={arc(b.from + (i ? 1 : 0), b.to - (i < BANDS.length - 1 ? 1 : 0))}
              fill="none"
              strokeWidth={14}
              stroke={b.stroke}
              className="reveal transition-opacity duration-500"
              style={{ "--i": i, opacity: i === active ? 1 : 0.32 } as React.CSSProperties}
            />
          ))}
          {/* Drawn pointing at 50, then rotated to the score around the dial's centre. */}
          <g
            style={{
              transform: `rotate(${(shown - 50) * 1.8}deg)`,
              transformOrigin: `${CX}px ${CY}px`,
              transition: "transform 1.4s cubic-bezier(0.34, 1.36, 0.64, 1) 0.15s",
            }}
          >
            <line x1={CX} y1={CY} x2={CX} y2={CY - 74} stroke="hsl(var(--foreground))" strokeWidth={3} strokeLinecap="round" />
          </g>
          <circle cx={CX} cy={CY} r={7} fill="hsl(var(--foreground))" />
          <circle cx={CX} cy={CY} r={3} fill="hsl(var(--card))" />
        </svg>
        <div className="relative mt-1.5 flex items-baseline gap-2.5">
          <AnimatedNumber value={shown} format={(v) => Math.round(v).toString()} durationMs={1400} className="numeric font-display text-[44px] font-semibold leading-none tracking-tighter" />
          <span className={cn("text-[15px] font-semibold", TONE_TEXT[band.tone])}>{band.label}</span>
        </div>
        <div className="relative mt-2 flex w-full max-w-[280px] justify-between text-[11px] text-muted-foreground">
          <span>Extreme fear</span>
          <span>Neutral</span>
          <span>Extreme greed</span>
        </div>
      </div>
      <dl className="flex-1 pt-2.5">
        {history.map((h) => {
          const b = BANDS[bandOf(h.score)]!
          return (
            <div key={h.label} className="flex items-center justify-between gap-3 border-t px-5 py-2.5 text-[13px]">
              <dt className="text-muted-foreground">{h.label}</dt>
              <dd className="inline-flex items-center gap-2">
                <span className="font-medium">{b.label}</span>
                <span className={cn("numeric inline-grid h-6 min-w-[30px] place-items-center rounded-lg text-xs font-semibold", TONE_BOX[b.tone])}>{h.score}</span>
              </dd>
            </div>
          )
        })}
      </dl>
      <p className="border-t px-5 pb-4 pt-2.5 text-xs text-muted-foreground">Stock-market sentiment, scored 0–100 from seven signals.</p>
    </SectionCard>
  )
}
