"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { TiltCard } from "@web/components/ui/tilt-card"
import { CastAvatar } from "@web/components/landing/cast-avatar"
import { CAST } from "@web/components/landing/demo"
import { teamLook, onColor } from "@web/lib/sports/teams"

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const smooth = (t: number) => t * t * (3 - 2 * t)
const usd = (v: number, digits = 0) => `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`

type Game = { away: string; home: string; when: string; awayLine: string; homeLine: string }
const SLATE: Game[] = [
  { away: "Los Angeles Lakers", home: "Denver Nuggets", when: "Tonight 9:30", awayLine: "+145", homeLine: "-170" },
  { away: "Miami Heat", home: "Milwaukee Bucks", when: "Tomorrow 7:00", awayLine: "+120", homeLine: "-140" },
]
const STAKE = 100
const TO_WIN = 59 // $100 at -170
const LABEL = "font-mono text-[10px] font-medium uppercase leading-4 tracking-[0.08em] text-[var(--fg3)]"

/** A team's logo (dark variant in dark mode), falling back to its initials on the team colour. */
function TeamMark({ name, size = 28 }: { name: string; size?: number }) {
  const look = teamLook("nba", name)
  const { resolvedTheme } = useTheme()
  const [bad, setBad] = useState(false)
  const src = resolvedTheme === "dark" && look.logoDark ? look.logoDark : look.logo
  if (!src || bad) {
    return (
      <span aria-hidden className="grid shrink-0 place-items-center rounded-full font-mono font-semibold" style={{ width: size, height: size, background: look.color, color: onColor(look.color), fontSize: size * 0.34 }}>
        {look.abbr}
      </span>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} className="shrink-0 object-contain" style={{ width: size, height: size }} />
}

function LineButton({ team, line, on }: { team: string; line: string; on: boolean }) {
  const look = teamLook("nba", team)
  return (
    <span
      className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--r-s)] border px-2.5 py-2 transition-[background-color,border-color,box-shadow] duration-200"
      style={{ borderColor: on ? "var(--pf-accent)" : "var(--line)", background: on ? "color-mix(in srgb, var(--pf-accent) 10%, transparent)" : "transparent", boxShadow: on ? "0 0 0 1px var(--pf-accent) inset" : "none" }}
    >
      <TeamMark name={team} size={26} />
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[11px] font-semibold leading-4">{look.abbr}</span>
        <span className="numeric block text-xs leading-4 text-[var(--fg2)]">{line}</span>
      </span>
    </span>
  )
}

function StakeField({ value }: { value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs text-[var(--fg3)]">Stake</p>
      <div className="flex h-10 items-center justify-between rounded-[var(--r-s)] border px-3 text-sm" style={{ borderColor: "var(--line)" }}>
        <span className="numeric font-medium">{value}</span>
        <span className="numeric text-xs text-[var(--fg3)]">play money</span>
      </div>
    </div>
  )
}

/** Sports step: an open-lines slate with a live game, a pick slip that locks into a ticket, and a leaderboard. All sample data, play money. */
export function SportsView({ e, tilt = 1.5 }: { e: number; tilt?: number }) {
  const picked = e > 0.16
  const stake = Math.round(STAKE * smooth(clamp((e - 0.2) / 0.2)))
  const toWin = Math.round((stake * TO_WIN) / STAKE)
  const locked = e >= 0.55
  const rise = smooth(clamp((e - 0.55) / 0.35))
  const cash = Math.round(STAKE + 28 * rise)
  const pressed = e > 0.93 && e < 0.985
  const run = smooth(clamp(e / 0.9))
  const win = Math.round(52 + 14 * run)
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" aria-label="Sports picks preview">
      <TiltCard max={tilt} glare={false} className="pf-panel pf-lift">
        <div className="pf-ph">
          <h3 className="pf-label">Open lines<em>Moneyline</em></h3>
          <span className="pf-ph-end pf-sample">Sample</span>
        </div>
        <div className="mx-4 mt-1 rounded-[var(--r-s)] border p-2.5 sm:mx-[18px]" style={{ borderColor: "var(--hair)", background: "var(--raise)" }}>
          <div className={`flex items-center justify-between ${LABEL}`}>
            <span className="flex items-center gap-1.5 text-[var(--loss-ink)]">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--loss)] opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-1.5 rounded-full bg-[var(--loss)]" />
              </span>
              Live now
            </span>
            <span>3rd · 4:12</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <TeamMark name="Boston Celtics" size={24} />
            <span className="numeric w-7 text-lg font-medium leading-6">{71 + Math.round(5 * run)}</span>
            <span className="text-xs text-[var(--fg3)]">vs</span>
            <span className="numeric w-7 text-lg font-medium leading-6">{70 + Math.round(2 * run)}</span>
            <TeamMark name="New York Knicks" size={24} />
            <span className="numeric ml-auto text-xs text-[var(--fg2)]">BOS {win}%</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: "var(--hair)" }} aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${win}%`, background: "var(--pf-accent)" }} />
          </div>
        </div>
        <ul className="divide-y px-4 sm:px-[18px]">
          {SLATE.map((g, k) => (
            <li key={g.home} className="py-3">
              <p className={`mb-2 ${LABEL}`}>{g.when}</p>
              <div className="flex gap-2">
                <LineButton team={g.away} line={g.awayLine} on={false} />
                <LineButton team={g.home} line={g.homeLine} on={k === 0 && picked} />
              </div>
            </li>
          ))}
        </ul>
      </TiltCard>

      <TiltCard max={tilt} glare={false} className="pf-panel pf-lift">
        <div className="pf-ph">
          <h3 className="pf-label">{locked ? "Locked pick" : "Pick slip"}</h3>
          <span className="pf-ph-end pf-sample">Play money</span>
        </div>
        <div className="pf-pb">
          <div className="flex items-center gap-2.5">
            <TeamMark name="Denver Nuggets" size={30} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">Nuggets to win</p>
              <p className="truncate text-xs text-[var(--fg3)]">Lakers at Nuggets</p>
            </div>
            <span className="numeric text-sm font-medium">-170</span>
          </div>
          {/* Both states share one grid cell, so locking never changes the card's height. */}
          <div className="mt-3 grid">
            <div className="space-y-2.5" style={{ gridArea: "1 / 1", opacity: locked ? 0 : 1, visibility: locked ? "hidden" : "visible", transition: "opacity 0.25s ease" }}>
              <StakeField value={usd(stake)} />
              <p className="flex h-4 items-center justify-between text-xs text-[var(--fg3)]"><span>To win</span><span className="numeric">{usd(toWin, 2)}</span></p>
              <span className="flex h-10 items-center justify-center rounded-[var(--r-s)] bg-primary text-sm font-medium text-primary-foreground">Lock pick</span>
            </div>
            <div className="space-y-2.5" style={{ gridArea: "1 / 1", opacity: locked ? 1 : 0, visibility: locked ? "visible" : "hidden", transition: "opacity 0.25s ease" }} aria-hidden={!locked}>
              <div className="rounded-[var(--r-s)] border px-3 py-2" style={{ borderColor: "var(--line)", background: "var(--raise)" }}>
                <p className="flex items-center justify-between text-xs text-[var(--fg3)]"><span>Stake {usd(STAKE)}</span><span>Cash out value</span></p>
                <p className="numeric font-display mt-0.5 text-[28px] leading-8" style={{ letterSpacing: "-0.03em" }}>{usd(cash)}</p>
              </div>
              <p className="flex h-4 items-center justify-between text-xs text-[var(--fg3)]"><span>If it holds</span><span className="numeric">{usd(STAKE + TO_WIN)}</span></p>
              <span className="flex h-10 items-center justify-center rounded-[var(--r-s)] border text-sm font-medium transition-transform duration-150" style={{ borderColor: "var(--pf-accent)", color: "var(--pf-accent)", transform: pressed ? "scale(0.97)" : "none" }}>Cash out</span>
            </div>
          </div>
        </div>
        <div className="border-t px-4 py-3 sm:px-[18px]" style={{ borderColor: "var(--hair)" }}>
          <p className="pf-label-plain">Leaderboard</p>
          <ul className="mt-2 space-y-1.5">
            {[CAST[1]!, CAST[0]!, CAST[3]!].map((m, i) => (
              <li key={m.id} className="flex items-center gap-2.5 text-[13px] leading-5">
                <span className="numeric w-4 text-center font-mono font-medium text-[var(--fg2)]">{i + 1}</span>
                <CastAvatar member={m} size={20} />
                <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
                <span className="numeric text-[var(--fg2)]">{["14-6", "12-8", "11-9"][i]}</span>
              </li>
            ))}
          </ul>
        </div>
      </TiltCard>
    </div>
  )
}
