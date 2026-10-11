"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { motion, useMotionValueEvent, useScroll } from "motion/react"
import { ArrowDownUp, Check } from "lucide-react"
import { PerformanceChart, type PerformancePoint } from "@web/components/charts/performance-chart"
import { RaceLines } from "@web/components/landing/league-preview"
import { scrollToY } from "@web/components/landing/smooth-scroll"
import { TiltCard } from "@web/components/ui/tilt-card"
import { CastAvatar } from "@web/components/landing/cast-avatar"
import { Delta } from "@web/components/ui/delta"
import { CAST } from "@web/components/landing/demo"
import { cn } from "@web/lib/utils"

type TabId = "portfolio" | "leagues" | "fantasy"
type Mode = "tabs" | "pinned" | "stacked"

const TABS: { id: TabId; label: string; title: string; body: string; points: string[]; note?: string }[] = [
  {
    id: "portfolio",
    label: "Portfolio",
    title: "Your money in one place",
    body: "Add what you hold and see where you stand.",
    points: ["Net worth across every account", "Returns that leave out deposits", "Put it in a league and friends see your return, never the amounts"],
    note: "Brokerage linking via Plaid: coming soon",
  },
  {
    id: "leagues",
    label: "Real leagues",
    title: "Race your friends on real returns",
    body: "Ranked by return, not balance, so a small account can win.",
    points: ["Friends see your return, never your amount", "Top tickers shared as a percent of your portfolio", "Race chart and reactions"],
  },
  {
    id: "fantasy",
    label: "Fantasy leagues",
    title: "Play it with play money",
    body: "Everyone starts with the same play money. No brokerage needed.",
    points: ["Buy and sell any stock", "Live standings", "A trade feed for the trash talk"],
  },
]


const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const smooth = (t: number) => t * t * (3 - 2 * t)
const numberStyle = (n: number) => ({ "--d": n }) as React.CSSProperties

/** 0 to 1 over `ms` once `on` turns true; used when a step plays by itself (the stacked phone layout). */
function useAutoProgress(on: boolean, ms = 1700) {
  const [e, setE] = useState(0)
  useEffect(() => {
    if (!on) return
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = clamp((t - start) / ms)
      setE(smooth(k))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [on, ms])
  return e
}

function useOnce<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setSeen(true); io.disconnect() } }, { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [seen, threshold])
  return [ref, seen] as const
}

function Heading() {
  return (
    <div>
      <p className="pf-label-plain pf-tick">What you get</p>
      <h2 className="pf-h2 mt-3 max-w-xl">One app for your money, your friends and the game.</h2>
    </div>
  )
}

function Copy({ t, on }: { t: (typeof TABS)[number]; on: boolean }) {
  return (
    <div className="pf-pane" data-on={on}>
      <h3 className="pf-h3 pf-rise" style={numberStyle(0)}>{t.title}</h3>
      <p className="pf-sub pf-rise mt-2 text-[15px] leading-6" style={numberStyle(1)}>{t.body}</p>
      <ul className="mt-4 space-y-2">
        {t.points.map((p, k) => (
          <li key={p} className="pf-sub pf-rise flex items-start gap-2.5 text-sm leading-6" style={numberStyle(2 + k)}>
            <Check className="mt-1 size-3.5 shrink-0 text-[var(--pf-accent)]" aria-hidden strokeWidth={2} />
            {p}
          </li>
        ))}
      </ul>
      {t.note ? <p className="pf-soon pf-rise mt-5" style={numberStyle(6)}>{t.note}</p> : null}
    </div>
  )
}

const View = memo(function View({ id, e, scrub }: { id: TabId; e: number; scrub: boolean }) {
  return id === "portfolio" ? <PortfolioView e={e} scrub={scrub} /> : id === "leagues" ? <LeaguesView e={e} /> : <FantasyView e={e} />
})

/** Scroll position inside the pinned runway, as 0..1. Mounted only while pinned. */
function PinnedDriver({ outer, onProgress }: { outer: React.RefObject<HTMLDivElement | null>; onProgress: (p: number) => void }) {
  const { scrollYProgress } = useScroll({ target: outer as React.RefObject<HTMLElement>, offset: ["start start", "end end"] })
  useMotionValueEvent(scrollYProgress, "change", onProgress)
  useEffect(() => onProgress(scrollYProgress.get()), [onProgress, scrollYProgress])
  return null
}

const STEPS = TABS.length
/** Local progress of step i for scroll position s (0..3): holds at the start, runs, then rests at 1. */
const localE = (s: number, i: number) => smooth(clamp((s - i - 0.1) / 0.72))

/**
 * Portfolio, real leagues and fantasy, one after another. On a wide screen the stage pins and one
 * scroll value drives everything: panels cross-fade as it passes a boundary, and inside each step
 * the chart, figures, standings and trades advance with it (scroll back and they rewind). On a
 * phone the steps stack and play as they arrive; with reduced motion it is plain tabs.
 */
export function ProductTour() {
  const [mode, setMode] = useState<Mode>("tabs")
  const [tab, setTab] = useState<TabId>("portfolio")
  const [es, setEs] = useState<[number, number, number]>([1, 1, 1])
  const outer = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLSpanElement>(null)
  const panes = useRef<(HTMLDivElement | null)[]>([])
  const last = useRef<number[]>([-1, -1, -1])
  const index = TABS.findIndex((t) => t.id === tab)

  useEffect(() => {
    const decide = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setMode("tabs")
      setMode(window.matchMedia("(min-width: 1024px) and (min-height: 760px)").matches ? "pinned" : "stacked")
    }
    decide()
    const queries = ["(prefers-reduced-motion: reduce)", "(min-width: 1024px) and (min-height: 760px)"].map((q) => window.matchMedia(q))
    queries.forEach((q) => q.addEventListener("change", decide))
    return () => queries.forEach((q) => q.removeEventListener("change", decide))
  }, [])

  const onProgress = useCallback((p: number) => {
    const v = clamp(p)
    const s = v * STEPS
    if (fill.current) fill.current.style.transform = `scaleY(${v})`
    setTab(TABS[Math.min(STEPS - 1, Math.floor(s))]!.id)
    // Cross-fade with overlap around each boundary; transform and opacity only.
    panes.current.forEach((el, i) => {
      if (!el) return
      const d = s - (i + 0.5)
      const o = smooth(clamp((0.5 + 0.14 - Math.abs(d)) / 0.28))
      const dir = clamp(-d / 0.7, -1, 1)
      el.style.opacity = o.toFixed(3)
      el.style.transform = `translate3d(0, ${(dir * 26).toFixed(1)}px, 0) scale(${(0.97 + 0.03 * o).toFixed(4)})`
      el.style.visibility = o < 0.01 ? "hidden" : "visible"
      el.style.pointerEvents = o > 0.6 ? "auto" : "none"
    })
    // Step progress for the figures, quantised so React only re-renders when something visibly moves.
    const next = [0, 1, 2].map((i) => Math.round(localE(s, i) * 120) / 120)
    if (next.some((n, i) => n !== last.current[i])) {
      last.current = next
      setEs(next as [number, number, number])
    }
  }, [])

  function jump(i: number) {
    if (mode !== "pinned" || !outer.current) return setTab(TABS[i]!.id)
    const rect = outer.current.getBoundingClientRect()
    const runway = outer.current.offsetHeight - (outer.current.firstElementChild as HTMLElement).offsetHeight
    // Land where the step has finished its run, so a click shows that step in full.
    scrollToY(rect.top + window.scrollY + ((i + 0.85) / STEPS) * runway)
  }

  if (mode === "stacked") {
    return (
      <section id="how" className="pf-rule scroll-mt-14">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:px-5 sm:py-24">
          <Heading />
          <div className="mt-10 space-y-14">
            {TABS.map((t, i) => (
              <StackedStep key={t.id} t={t} i={i} />
            ))}
          </div>
          <p className="pf-muted mt-12 text-sm">Also: a daily News tab with the market recap, movers and earnings week.</p>
        </div>
      </section>
    )
  }

  const pinned = mode === "pinned"
  const stage = (
    <div className={cn("mx-auto max-w-6xl px-6 sm:px-5", pinned ? "flex h-full flex-col justify-center py-6" : "py-16 sm:py-24")}>
      <Heading />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <div>
          <div role="tablist" aria-label="Product tour" className="pf-rail relative flex flex-col">
            <span aria-hidden className="pf-rail-line" />
            <span aria-hidden ref={fill} className="pf-rail-fill" style={pinned ? undefined : { transform: `scaleY(${(index + 1) / STEPS})` }} />
            {TABS.map((t, i) => (
              <button
                key={t.id}
                role="tab"
                id={`tour-tab-${t.id}`}
                aria-selected={t.id === tab}
                aria-controls="tour-panel"
                tabIndex={t.id === tab ? 0 : -1}
                onClick={() => jump(i)}
                onKeyDown={(e) => {
                  const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0
                  if (!step) return
                  e.preventDefault()
                  const n = (i + step + STEPS) % STEPS
                  jump(n)
                  document.getElementById(`tour-tab-${TABS[n]!.id}`)?.focus()
                }}
                className="pf-tab min-h-[44px] text-left"
                data-active={t.id === tab || undefined}
              >
                <span className="pf-step-num">0{i + 1}</span>
                <span className="pf-tab-title">{t.label}</span>
              </button>
            ))}
          </div>
          <div className="pf-stack mt-7">
            {TABS.map((t) => (
              <Copy key={t.id} t={t} on={t.id === tab} />
            ))}
          </div>
        </div>

        <div id="tour-panel" role="tabpanel" aria-labelledby={`tour-tab-${tab}`} className="pf-stack min-w-0 lg:min-h-[470px]">
          {pinned
            ? TABS.map((t, i) => (
                <div key={t.id} ref={(el) => { panes.current[i] = el }} className="pf-live" style={{ opacity: i === 0 ? 1 : 0, visibility: i === 0 ? "visible" : "hidden" }}>
                  <View id={t.id} e={es[i]!} scrub />
                </div>
              ))
            : TABS.filter((t) => t.id === tab).map((t) => (
                <div key={t.id} className="pf-pane pf-card-in" data-on>
                  <View id={t.id} e={1} scrub={false} />
                </div>
              ))}
        </div>
      </div>
      <p className="pf-muted mt-8 text-sm">Also: a daily News tab with the market recap, movers and earnings week.</p>
    </div>
  )

  return (
    <section id="how" className="pf-rule scroll-mt-14">
      {pinned ? (
        <div ref={outer} style={{ height: "300vh" }}>
          <PinnedDriver outer={outer} onProgress={onProgress} />
          <div className="sticky top-14 overflow-hidden" style={{ height: "calc(100vh - 56px)" }}>{stage}</div>
        </div>
      ) : (
        stage
      )}
    </section>
  )
}

function StackedStep({ t, i }: { t: (typeof TABS)[number]; i: number }) {
  const [ref, seen] = useOnce<HTMLDivElement>(0.2)
  const e = useAutoProgress(seen)
  return (
    <div ref={ref} data-on={seen}>
      <p className="pf-step-num pf-tick">0{i + 1} · {t.label}</p>
      <div className="mt-4"><Copy t={t} on={seen} /></div>
      <div className="pf-card-in mt-6" data-on={seen}>
        <View id={t.id} e={e} scrub={false} />
      </div>
    </div>
  )
}

/* ---------- Portfolio ---------- */

function walk(seed: number, n: number, start: number, drift: number, vol: number): number[] {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const out = [start]
  for (let i = 1; i < n; i++) out.push(out[i - 1]! * (1 + drift + (rnd() - 0.5) * vol))
  return out
}

const NET_WORTH: PerformancePoint[] = walk(21, 90, 41800, 0.0016, 0.012).map((value, i) => ({
  date: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10),
  value: Math.round(value),
}))

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const money = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`

const ACCOUNTS = [
  { name: "Brokerage", inst: "Fidelity", amount: "$31,420" },
  { name: "Taxable", inst: "Robinhood", amount: "$9,880" },
  { name: "Roth IRA", inst: "Vanguard", amount: "$6,960" },
]

function Monogram({ name }: { name: string }) {
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg border bg-[var(--raise)] font-mono text-[11px] font-medium text-[var(--fg2)]" style={{ borderColor: "var(--hair)" }}>
      {name.slice(0, 1)}
    </span>
  )
}

const Chart = memo(PerformanceChart)

function PortfolioView({ e }: { e: number; scrub: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const first = NET_WORTH[0]!
  const reached = Math.round(e * (NET_WORTH.length - 1))
  // Hovering only makes sense once the line has fully drawn.
  const hoverIndex = e >= 0.98 ? hover : null
  const at = NET_WORTH[hoverIndex ?? reached]!
  const ret = (at.value / first.value - 1) * 100
  const moving = hoverIndex !== null || e < 0.999
  const onHover = useCallback((i: number | null) => setHover(i), [])
  return (
    <TiltCard max={4} glow className="pf-panel pf-lift">
      <div className="pf-ph">
        <h3 className="pf-label">Net worth</h3>
        <span className="pf-ph-end text-xs text-[var(--fg3)]">Last 90 days</span>
      </div>
      <div className="pf-pb">
        <p className="numeric font-display text-[40px] leading-[46px] sm:text-[52px] sm:leading-[58px]" style={{ letterSpacing: "-0.035em" }}>
          {money(at.value)}
        </p>
        <div className="mt-2 flex h-6 items-center gap-3 overflow-hidden whitespace-nowrap">
          <Delta value={ret} variant="plain" />
          <span className="numeric truncate text-xs text-[var(--fg3)]">
            {moving ? `${dayLabel(at.date)} · since ${dayLabel(first.date)}` : "return, leaves out money you add"}
          </span>
        </div>
        <div className="-mx-1 mt-3" style={{ touchAction: "pan-y", maskImage: `linear-gradient(90deg, #000 ${(e * 106 - 6).toFixed(1)}%, transparent ${(e * 106).toFixed(1)}%)`, WebkitMaskImage: `linear-gradient(90deg, #000 ${(e * 106 - 6).toFixed(1)}%, transparent ${(e * 106).toFixed(1)}%)`, pointerEvents: e >= 0.98 ? "auto" : "none" }}>
          <Chart points={NET_WORTH} height={170} ariaLabel="Net worth over the last 90 days" showTooltip={false} onHover={onHover} />
        </div>
      </div>
      <ul className="divide-y border-t px-4 sm:px-[18px]" style={{ borderColor: "var(--hair)" }}>
        {ACCOUNTS.map((a, k) => {
          const f = clamp((e - 0.5 - 0.12 * k) / 0.2)
          return (
            <li key={a.name} className="flex items-center gap-3 py-3" style={{ opacity: f, transform: `translate3d(0, ${((1 - f) * 8).toFixed(1)}px, 0)` }}>
              <Monogram name={a.inst} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.name}</p>
                <p className="truncate text-xs text-[var(--fg3)]">{a.inst} · added by hand</p>
              </div>
              <span className="numeric text-sm font-medium">{a.amount}</span>
            </li>
          )
        })}
      </ul>
    </TiltCard>
  )
}

/* ---------- Real leagues ---------- */

function LeaguesView({ e }: { e: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const days = CAST[0]!.points.length
  const reach = Math.max(1, Math.round(e * (days - 1)))
  const day = Math.min(hover ?? reach, reach)
  const rows = CAST.map((m) => ({ m, pct: m.points[day]! - 100 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4)
  return (
    <TiltCard max={4} glow className="pf-panel pf-lift">
      <div className="pf-ph">
        <h3 className="pf-label">
          The Group Chat<em>Ranked by return</em>
        </h3>
        <span className="pf-ph-end pf-sample">Sample league</span>
      </div>
      <div className="px-4 pt-1 sm:px-[18px]" style={{ height: 150 }}>
        <div className="relative h-full">
          <RaceLines members={CAST} hover={hover} setHover={setHover} upto={reach} minHeight={150} />
        </div>
      </div>
      <ul className="divide-y border-t px-4 pb-1 sm:px-[18px]" style={{ borderColor: "var(--hair)" }}>
        {rows.map(({ m, pct }, i) => (
          <motion.li key={m.id} layout="position" transition={{ type: "spring", stiffness: 420, damping: 38 }} className="py-2.5">
            <div className="flex items-center gap-3">
              <span className="numeric w-5 shrink-0 text-center font-mono text-sm font-medium" style={{ color: i < 3 ? ["var(--rank-1)", "var(--rank-2)", "var(--rank-3)"][i] : "var(--fg3)" }}>{i + 1}</span>
              <span className="rounded-full p-[2px]" style={{ boxShadow: `0 0 0 1.5px ${m.color}` }}><CastAvatar member={m} size={26} /></span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}{m.isYou ? <span className="ml-1.5 rounded bg-foreground px-1 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-background">you</span> : null}</span>
              <span className="hidden items-center gap-1.5 sm:flex">
                {m.holdings.map((h) => (
                  <span key={h.ticker} className="numeric inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px] font-medium" style={{ borderColor: "var(--hair)", backgroundImage: `linear-gradient(90deg, rgba(var(--accent-a), 0.16) ${h.weight}%, transparent ${h.weight}%)` }}>
                    <span className="font-mono font-semibold">{h.ticker}</span>
                    <span className="text-[var(--fg3)]">{h.weight}%</span>
                  </span>
                ))}
              </span>
              <span className="w-[76px] text-right"><Delta value={pct} variant="plain" /></span>
            </div>
          </motion.li>
        ))}
      </ul>
    </TiltCard>
  )
}

/* ---------- Fantasy ---------- */

type Trade = { side: "Buy" | "Sell"; ticker: string; px: number; qty: number }
const TRADES: Trade[] = [
  { side: "Buy", ticker: "NVDA", px: 142.1, qty: 10 },
  { side: "Buy", ticker: "VTI", px: 268.4, qty: 12 },
  { side: "Sell", ticker: "NVDA", px: 143.5, qty: 4 },
]
const START_CASH = 100000
const usd = (v: number, digits = 0) => `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
const FEED_OLD = [
  { who: "Theo", what: "bought 12 NVDA", when: "2h" },
  { who: "Dev", what: "sold 40 SOFI", when: "5h" },
]

function FantasyView({ e }: { e: number }) {
  const t = e * TRADES.length
  const k = Math.min(TRADES.length - 1, Math.floor(t))
  const lp = e >= 1 ? 1 : t - k
  const trade = TRADES[k]!
  const sign = (x: Trade) => (x.side === "Buy" ? -1 : 1)
  const settled = TRADES.slice(0, k).concat(lp >= 0.8 ? [trade] : [])
  const baseCash = START_CASH + TRADES.slice(0, k).reduce((a, x) => a + sign(x) * x.qty * x.px, 0)
  const qty = Math.round(trade.qty * smooth(clamp(lp / 0.55)))
  const cashAfter = baseCash + sign(trade) * qty * trade.px
  const pressed = lp > 0.62 && lp < 0.82
  const feed = settled.slice().reverse()
  const tick = (final: number) => final * smooth(clamp(e / 0.9))
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-label="Fantasy league preview">
      <TiltCard max={4.5} glow className="pf-panel pf-lift">
        <div className="pf-ph">
          <h3 className="pf-label">Make a move</h3>
          <span className="pf-ph-end pf-sample">Play money</span>
        </div>
        <div className="pf-pb space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg border p-1 text-center text-sm font-medium" style={{ borderColor: "var(--hair)" }}>
            <span className={cn("rounded-md py-1.5 transition-colors", trade.side === "Buy" ? "bg-[var(--raise)]" : "text-[var(--fg3)]")}>Buy</span>
            <span className={cn("rounded-md py-1.5 transition-colors", trade.side === "Sell" ? "bg-[var(--raise)]" : "text-[var(--fg3)]")}>Sell</span>
          </div>
          <Field label="Stock" value={trade.ticker} aside={usd(trade.px, 2)} />
          <Field label="Shares" value={String(qty)} aside={usd(qty * trade.px, 2)} />
          <p className="flex h-4 items-center justify-between text-xs text-[var(--fg3)]">
            <span>Cash after</span>
            <span className="numeric">{usd(cashAfter)}</span>
          </p>
          <span className="flex h-10 items-center justify-center gap-2 rounded-[var(--r-s)] bg-primary text-sm font-medium text-primary-foreground transition-transform duration-150" style={{ transform: pressed ? "scale(0.97)" : "none" }}>
            <ArrowDownUp className="size-4" aria-hidden />
            {trade.side} {trade.ticker}
          </span>
        </div>
      </TiltCard>

      <TiltCard max={4.5} glow className="pf-panel pf-lift">
        <div className="pf-ph">
          <h3 className="pf-label">Standings</h3>
        </div>
        <ul className="divide-y px-4 sm:px-[18px]">
          {[CAST[0]!, CAST[2]!, CAST[4]!].map((m, i) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <span className="numeric w-5 text-center font-mono text-sm font-medium text-[var(--fg2)]">{i + 1}</span>
              <CastAvatar member={m} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
              <Delta value={tick([5.4, 2.1, -1.8][i]!)} variant="plain" />
            </li>
          ))}
        </ul>
        <div className="border-t px-4 py-3 sm:px-[18px]" style={{ borderColor: "var(--hair)" }}>
          <p className="pf-label-plain">Trade feed</p>
          <ul className="mt-2 min-h-[130px] space-y-1.5">
            {feed.map((f) => (
              <motion.li key={f.ticker + f.side + f.qty} layout="position" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 380, damping: 32 }} className="flex justify-between gap-3 text-[13px] leading-5">
                <span className="truncate"><b className="font-medium">You</b> <span className="text-[var(--fg2)]">{f.side === "Buy" ? "bought" : "sold"} {f.qty} {f.ticker}</span></span>
                <span className="text-[var(--fg3)]">now</span>
              </motion.li>
            ))}
            {FEED_OLD.map((f) => (
              <motion.li key={f.what} layout="position" className="flex justify-between gap-3 text-[13px] leading-5">
                <span className="truncate"><b className="font-medium">{f.who}</b> <span className="text-[var(--fg2)]">{f.what}</span></span>
                <span className="text-[var(--fg3)]">{f.when}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      </TiltCard>
    </div>
  )
}

function Field({ label, value, aside }: { label: string; value: string; aside: string }) {
  return (
    <div>
      <p className="mb-1 text-xs text-[var(--fg3)]">{label}</p>
      <div className="flex h-10 items-center justify-between rounded-[var(--r-s)] border px-3 text-sm" style={{ borderColor: "var(--line)" }}>
        <span className="numeric font-medium">{value}</span>
        <span className="numeric text-xs text-[var(--fg3)]">{aside}</span>
      </div>
    </div>
  )
}
