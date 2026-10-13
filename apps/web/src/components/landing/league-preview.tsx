"use client"

import { useId, useMemo, useState } from "react"
import { Delta } from "@web/components/ui/delta"
import { Sparkline } from "@web/components/ui/sparkline"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import { TiltCard } from "@web/components/ui/tilt-card"
import { CastAvatar } from "@web/components/landing/cast-avatar"
import { CAST, type Member } from "@web/components/landing/demo"
import { monotonePath, niceTicks, spreadLabels, xAt, pointIndexAt } from "@web/lib/chart-math"
import { useMeasure } from "@web/lib/use-measure"

/** Tickers the logo proxy has no icon for; they get the monogram without a failing request. */
const NO_LOGO = new Set(["SOFI"])

const MEDALS = ["var(--rank-1)", "var(--rank-2)", "var(--rank-3)"]
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`

/** The hero: a sample league drawn the way the app draws one, tipping toward the cursor. */
export function LeaguePreview({ tilt = 1.5 }: { tilt?: number }) {
  const [expanded, setExpanded] = useState(false)
  const [day, setDay] = useState<number | null>(null)
  const idx = day ?? CAST[0]!.points.length - 1
  return (
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <TiltCard max={tilt} glare={false} className="pf-panel pf-lift flex flex-col">
          <div className="pf-ph">
            <h3 className="pf-label">
              The Group Chat<em>Last 30 days</em>
            </h3>
            <span className="pf-ph-end pf-sample">Sample league</span>
          </div>
          <div className="pf-pb flex flex-1 flex-col !pb-3">
            <RaceLines members={CAST} hover={day} setHover={setDay} />
          </div>
        </TiltCard>

        <TiltCard max={tilt} glare={false} className="pf-panel pf-lift">
          <div className="pf-ph">
            <h3 className="pf-label">Standings</h3>
            <span className="pf-ph-end pf-sample">Ranked by return</span>
          </div>
          <ul className="pf-hero-standings divide-y px-4 sm:px-[18px]" data-expanded={expanded}>
            {CAST.map((m, i) => (
              <Row key={m.id} member={m} rank={i + 1} percent={m.points[idx]! - 100} />
            ))}
          </ul>
          <button type="button" className="pf-hero-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Show top three" : "See all five players"}</button>
        </TiltCard>
      </div>
  )
}

function Row({ member, rank, percent }: { member: Member; rank: number; percent: number }) {
  const medal = rank <= 3 ? MEDALS[rank - 1] : undefined
  return (
    <li className="py-3" style={medal ? { boxShadow: `inset 2px 0 0 ${medal}` } : undefined}>
      <div className="flex items-center gap-3 pl-1">
        <span className="numeric w-5 shrink-0 text-center font-mono text-sm font-medium" style={{ color: medal ?? "var(--fg3)" }}>
          {rank}
        </span>
        <span className="rounded-full p-[2px]" style={{ boxShadow: `0 0 0 1.5px ${member.color}` }}>
          <CastAvatar member={member} size={30} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-5">
            {member.name}
            {member.isYou ? <span className="ml-1.5 rounded bg-foreground px-1 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-background">you</span> : null}
          </p>
          <p className="truncate text-xs leading-4 text-[var(--fg3)]">{member.note}</p>
        </div>
        <Sparkline points={member.points} width={72} height={24} className="hidden shrink-0 sm:block" />
        <span className="w-[72px] shrink-0 text-right"><Delta value={percent} variant="plain" /></span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[68px]">
        {member.holdings.map((h) => (
          <span key={h.ticker} className="numeric inline-flex items-center gap-1.5 rounded-full border py-px pl-1 pr-2 text-[11px] font-medium" style={{ borderColor: "var(--hair)", backgroundImage: `linear-gradient(90deg, rgba(var(--accent-a), 0.16) ${h.weight}%, transparent ${h.weight}%)` }}>
            <TickerLogo symbol={h.ticker} kind={NO_LOGO.has(h.ticker) ? "crypto" : "stock"} size="xs" className="!size-[16px] !rounded-full !text-[5px]" />
            <span className="font-mono font-semibold">{h.ticker}</span>
            <span className="text-[var(--fg3)]">{h.weight}%</span>
          </span>
        ))}
        {member.reactions.map((r) => (
          <span key={r.emoji} className="numeric inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px] text-[var(--fg2)]" style={{ borderColor: "var(--hair)", background: "var(--raise)" }}>
            <span aria-hidden>{r.emoji}</span>
            {r.count}
          </span>
        ))}
      </div>
    </li>
  )
}

/** Returns on one axis, everyone from 0% on day one. Hover or touch to scrub to a day. */
export function RaceLines({ members, hover, setHover, upto, minHeight = 250 }: { members: Member[]; hover: number | null; setHover: (i: number | null) => void; /** Index the lines have reached (the tour grows them); defaults to the last day. */ upto?: number; minHeight?: number }) {
  const { ref, width, height } = useMeasure<HTMLDivElement>()
  const revealId = useId()
  const reveal = upto === undefined
  const days = members[0]!.points.length

  const compact = width > 0 && width < 520
  const pad = { top: 16, right: compact ? 76 : 104, bottom: 24, left: 38 }

  const reach = Math.min(days - 1, Math.max(1, upto ?? days - 1))
  const g = useMemo(() => {
    if (width <= 0 || height <= 0) return null
    const plotW = Math.max(0, width - pad.left - pad.right)
    const innerH = height - pad.top - pad.bottom
    const all = members.flatMap((m) => m.points.map((p) => p - 100))
    const lo = Math.min(...all, 0) - 1.5
    const hi = Math.max(...all) + 1.5
    const y = (v: number) => pad.top + innerH - ((v - lo) / (hi - lo)) * innerH
    const ticks = niceTicks(lo, hi, 4)
    const lines = members.map((m) => {
      const pts = m.points.map((p, i) => [xAt(i, days, pad.left, plotW), y(p - 100)] as const)
      return { m, d: monotonePath(pts.slice(0, reach + 1)), pts }
    })
    return { plotW, innerH, y, ticks, lines, lo, hi }
    // pad is derived from width alone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, width, height, days, reach])

  const idx = Math.min(hover ?? reach, reach)
  const labels = useMemo(() => {
    if (!g) return []
    const desired = g.lines.map((l) => l.pts[idx]![1])
    const spread = spreadLabels(desired, 15, pad.top + 6, height - pad.bottom - 4)
    return g.lines.map((l, i) => ({ m: l.m, y: spread[i]!, dotY: desired[i]!, v: l.m.points[idx]! - 100 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, idx, height])


  return (
    <div ref={ref} className="pf-race-lines relative flex-1" style={{ touchAction: "pan-y", minHeight }}>
      {g ? (
        <svg
          width={width}
          height={height}
          className="absolute inset-0 block overflow-visible"
          role="img"
          aria-label="Returns for the last 30 days: Theo +14.2%, Sam +8.9%, Priya +6.8%, Maya +3.1%, Dev −4.6%."
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            setHover(pointIndexAt(e.clientX - box.left, pad.left, g.plotW, days))
          }}
          onPointerLeave={() => setHover(null)}
        >
          {g.ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={pad.left + g.plotW} y1={g.y(t)} y2={g.y(t)} stroke="var(--hair)" strokeWidth={t === 0 ? 1.25 : 1} strokeDasharray={t === 0 ? undefined : "2 4"} />
              <text x={pad.left - 8} y={g.y(t) + 3.5} textAnchor="end" className="numeric" fontSize="10.5" fill="var(--fg3)">
                {t > 0 ? "+" : t < 0 ? "−" : ""}
                {Math.abs(t)}%
              </text>
            </g>
          ))}


          <defs>
            <clipPath id={revealId} clipPathUnits="userSpaceOnUse">
              <rect width={width} height={height} className={reveal ? "pf-landing-reveal" : undefined} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${revealId})`}>
            {[...g.lines].reverse().map(({ m, d }) => (
              <path key={m.id} d={d} fill="none" stroke={m.color} strokeWidth={m.isYou ? 2.6 : 1.9} strokeLinecap="round" strokeLinejoin="round" opacity={m.id === "theo" || m.isYou ? 1 : 0.85} />
            ))}
          </g>

          {hover !== null ? <line x1={g.lines[0]!.pts[idx]![0]} x2={g.lines[0]!.pts[idx]![0]} y1={pad.top} y2={height - pad.bottom} stroke="var(--fg3)" strokeWidth="1" opacity="0.55" /> : null}

          {labels.map(({ m, y, dotY, v }) => {
            const x = g.lines[0]!.pts[idx]![0]
            return (
              <g key={m.id}>
                <circle cx={x} cy={dotY} r={m.isYou ? 4 : 3.2} fill={m.color} stroke="var(--panel)" strokeWidth="1.5" />
                <text x={pad.left + g.plotW + 10} y={y + 3.5} fontSize="11.5" fontWeight={m.isYou ? 600 : 500} fill="var(--fg)" className="pf-lbl-end">
                  {m.name}
                  <tspan className="numeric" fill={v >= 0 ? "var(--gain)" : "var(--loss)"} dx="6" fontWeight="500">
                    {signed(v)}
                  </tspan>
                </text>
              </g>
            )
          })}

          <text x={pad.left} y={height - 6} fontSize="10.5" fill="var(--fg3)">Day 1</text>
          <text x={pad.left + g.plotW} y={height - 6} textAnchor="end" fontSize="10.5" fill="var(--fg3)">{hover === null ? "Today" : `Day ${idx + 1}`}</text>
        </svg>
      ) : null}
    </div>
  )
}
