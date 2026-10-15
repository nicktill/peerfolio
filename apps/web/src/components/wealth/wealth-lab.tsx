"use client"

import "./wealth.css"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatedNumber } from "@web/components/ui/animated-number"
import { useApi } from "@web/lib/use-api"
import {
  DEFAULT_SCENARIO_SPREAD,
  monthsToReachTarget,
  project,
  requiredMonthlyContribution,
  scenarios,
  yearsSaved,
  type WealthInputs,
} from "@web/lib/wealth/engine"
import { decodeWealthParams } from "@web/lib/wealth/link"
import { MiniField, SliderField } from "./controls"
import { duration, usd, usdCompact } from "./format"
import { WealthChart, type SeriesKind } from "./wealth-chart"

type State = {
  startingValue: number
  monthlyContribution: number
  annualContributionGrowthPct: number
  years: number
  expectedAnnualReturnPct: number
  inflationPct: number
  targetValue: number
  spread: number
  importedStart: boolean
  // question cards
  askYears: number
  askExtra: number
  askReturn: number
}

const DEFAULTS: State = {
  startingValue: 25_000,
  monthlyContribution: 1_000,
  annualContributionGrowthPct: 3,
  years: 25,
  expectedAnnualReturnPct: 7,
  inflationPct: 2.5,
  targetValue: 1_000_000,
  spread: DEFAULT_SCENARIO_SPREAD,
  importedStart: false,
  askYears: 15,
  askExtra: 250,
  askReturn: 5,
}
const STORAGE_KEY = "peerfolio.wealth-lab.v1"
const CHIPS = [100_000, 500_000, 1_000_000, 2_000_000]

function load(): State | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<State>
    const out = { ...DEFAULTS }
    for (const k of Object.keys(DEFAULTS) as (keyof State)[]) {
      const v = parsed[k]
      if (typeof v === typeof DEFAULTS[k] && (typeof v !== "number" || Number.isFinite(v))) (out as Record<string, unknown>)[k] = v
    }
    return out
  } catch {
    return null
  }
}

type PortfolioSummary = { summary?: { investableAssets?: number } }

export function WealthLab() {
  const [s, setS] = useState<State>(DEFAULTS)
  const [ready, setReady] = useState(false)
  const [kind, setKind] = useState<SeriesKind>("nominal")
  const [hover, setHover] = useState<number | null>(null)
  const [wantImport, setWantImport] = useState(false)
  // Fields prefilled by an assistant link. They clear when the person edits that field.
  const [fromAssistant, setFromAssistant] = useState<ReadonlySet<string>>(new Set())
  const linked = useRef<State | null>(null)
  const booted = useRef(false)
  const set = useCallback(<K extends keyof State>(key: K, value: State[K]) => {
    setS((p) => ({ ...p, [key]: value }))
    setFromAssistant((f) => (f.has(key) ? new Set([...f].filter((k) => k !== key)) : f))
  }, [])

  useEffect(() => {
    // Strict mode runs this twice; the link is consumed (and the URL cleaned) the first time.
    if (booted.current) return
    booted.current = true
    const saved = load()
    // Restoring last-used inputs after mount keeps the server render and first client render identical.
    const fromLink = decodeWealthParams(window.location.search)
    if (fromLink) {
      // The link wins for this visit only: it isn't saved until the person edits something.
      const fields = fromLink
      const next: State = { ...(saved ?? DEFAULTS), ...fields, importedStart: false }
      linked.current = next
      setS(next)
      setFromAssistant(new Set(Object.keys(fields).filter((k) => k !== "spread")))
      window.history.replaceState(null, "", window.location.pathname)
    } else if (saved) setS(saved)
    setReady(true)
  }, [])
  useEffect(() => {
    if (!ready || s === linked.current) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* private mode, quota: inputs just won't persist */ }
  }, [s, ready])

  // Read-only portfolio import (only fetched after the button is pressed).
  const portfolio = useApi<PortfolioSummary>(wantImport ? "/api/portfolio" : null)
  const imported = portfolio.data?.summary?.investableAssets
  const applied = useRef(false)
  useEffect(() => {
    if (!wantImport || applied.current || imported == null) return
    applied.current = true
    setS((p) => ({ ...p, startingValue: Math.max(0, Math.round(imported)), importedStart: true }))
    setFromAssistant((f) => { const n = new Set(f); n.delete("startingValue"); return n })
    setWantImport(false)
  }, [wantImport, imported])
  const importing = wantImport && portfolio.loading && imported == null

  const inputs: WealthInputs = useMemo(
    () => ({
      startingValue: s.startingValue,
      monthlyContribution: s.monthlyContribution,
      annualContributionGrowthPct: s.annualContributionGrowthPct,
      years: s.years,
      expectedAnnualReturnPct: s.expectedAnnualReturnPct,
      inflationPct: s.inflationPct,
      targetValue: s.targetValue,
    }),
    [s.startingValue, s.monthlyContribution, s.annualContributionGrowthPct, s.years, s.expectedAnnualReturnPct, s.inflationPct, s.targetValue],
  )
  const sc = useMemo(() => scenarios(inputs, s.spread), [inputs, s.spread])
  const sum = sc.base.summary
  const months = sc.base.months
  const target = sc.base.inputs.targetValue

  const beyond = useMemo(() => (target > 0 && sum.monthsToTarget == null ? monthsToReachTarget(inputs) : null), [inputs, target, sum.monthsToTarget])

  // Question cards.
  const needed = useMemo(() => (target > 0 ? requiredMonthlyContribution(target, s.askYears, inputs) : null), [inputs, target, s.askYears])
  const saved = useMemo(() => (target > 0 ? yearsSaved(s.askExtra, inputs) : null), [inputs, target, s.askExtra])
  const alt = useMemo(() => project({ ...inputs, expectedAnnualReturnPct: s.askReturn }), [inputs, s.askReturn])
  const altMonths = useMemo(() => (target > 0 ? monthsToReachTarget({ ...inputs, expectedAnnualReturnPct: s.askReturn }) : null), [inputs, target, s.askReturn])

  const fmt = useCallback((v: number) => usd(v), [])
  const fmtPct = useCallback((v: number) => `${Math.round(v * 100)}%`, [])
  const active = hover != null ? hover : months
  const activeBase = sc.base.points[Math.min(active, months)]!

  const targetLabel = sum.monthsToTarget == null
    ? beyond != null ? `${duration(beyond)}` : target > 0 ? "Not within 100y" : "—"
    : duration(sum.monthsToTarget)
  const targetNote = target <= 0 ? "Set a target" : sum.monthsToTarget != null ? "within your horizon" : beyond != null ? "beyond your horizon" : "at these assumptions"

  const ariaLabel = `Projection over ${s.years} years. Base case ${usd(sum.finalNominal)} nominal, ${usd(sum.finalReal)} in today's dollars. Conservative ${usd(sc.conservative.summary.finalNominal)}, optimistic ${usd(sc.optimistic.summary.finalNominal)}. Use left and right arrow keys to step through months.`

  return (
    <div>
      <div className="pf-phead">
        <div>
          <h1>Wealth Lab</h1>
          <p className="pf-lede">Project where steady saving could take you, and see what each lever is worth. Everything here runs on the assumptions you set.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-stretch">
        {/* Controls */}
        <section className="pf-panel" aria-label="Assumptions">
          <div className="pf-ph">
            <span className="pf-label">Assumptions</span>
            <div className="pf-ph-end">
              <button type="button" className="pf-link" onClick={() => { applied.current = false; setWantImport(true) }} disabled={importing} aria-busy={importing}>
                {importing ? "Loading…" : "Use my portfolio value"}
              </button>
            </div>
          </div>
          <div className="pf-pb divide-y divide-[var(--hair2)]">
            <SliderField label="Starting value" prefix="$" value={s.startingValue} min={0} max={1_000_000} step={1_000} tag={fromAssistant.has("startingValue") ? "from assistant" : s.importedStart ? "imported" : undefined}
              onChange={(v) => { setS((p) => ({ ...p, startingValue: v, importedStart: false })); setFromAssistant((f) => { const n = new Set(f); n.delete("startingValue"); return n }) }}
              hint={portfolio.error && wantImport ? "Couldn't load your portfolio. Enter a value instead." : undefined} />
            <SliderField label="Monthly contribution" tag={fromAssistant.has("monthlyContribution") ? "from assistant" : undefined} prefix="$" value={s.monthlyContribution} min={0} max={10_000} step={50} onChange={(v) => set("monthlyContribution", v)} />
            <SliderField label="Contribution growth" tag={fromAssistant.has("annualContributionGrowthPct") ? "from assistant" : undefined} suffix="%/yr" decimals={1} value={s.annualContributionGrowthPct} min={0} max={10} step={0.5} onChange={(v) => set("annualContributionGrowthPct", v)} hint="Raise your contribution by this much each year." />
            <SliderField label="Years" tag={fromAssistant.has("years") ? "from assistant" : undefined} suffix="yrs" value={s.years} min={1} max={50} step={1} onChange={(v) => set("years", v)} />
            <SliderField label="Expected return" tag={fromAssistant.has("expectedAnnualReturnPct") ? "from assistant" : undefined} suffix="%/yr" decimals={1} value={s.expectedAnnualReturnPct} min={0} max={15} step={0.1} onChange={(v) => set("expectedAnnualReturnPct", v)} hint="An assumption, not a forecast." />
            <SliderField label="Inflation" tag={fromAssistant.has("inflationPct") ? "from assistant" : undefined} suffix="%/yr" decimals={1} value={s.inflationPct} min={0} max={10} step={0.1} onChange={(v) => set("inflationPct", v)} />
            <div className="py-3 last:pb-0">
              <SliderField inputId="wl-target" label="Target" tag={fromAssistant.has("targetValue") ? "from assistant" : undefined} prefix="$" value={s.targetValue} min={0} max={5_000_000} step={25_000} onChange={(v) => set("targetValue", v)} />
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Target presets">
                {CHIPS.map((c) => (
                  <button key={c} type="button" className="wl-chip" aria-pressed={s.targetValue === c} onClick={() => set("targetValue", c)}>{usdCompact(c)}</button>
                ))}
                <button type="button" className="wl-chip" aria-pressed={!CHIPS.includes(s.targetValue)} onClick={() => document.getElementById("wl-target")?.focus()}>Custom</button>
              </div>
            </div>
          </div>
        </section>

        {/* Results */}
        <div className="grid min-w-0 gap-4">
          <section className="pf-panel wl-panel" aria-label="Projection">
            <div className="pf-ph">
              <span className="pf-label">Projection <em>{s.years} years</em></span>
              <div className="pf-ph-end">
                <div className="flex items-center gap-1.5" role="group" aria-label="Value basis">
                  <button type="button" className="wl-chip" aria-pressed={kind === "nominal"} onClick={() => setKind("nominal")}>Nominal</button>
                  <button type="button" className="wl-chip" aria-pressed={kind === "real"} onClick={() => setKind("real")}>Today&apos;s $</button>
                </div>
              </div>
            </div>
            <div className="pf-pb pb-2">
              <div className="text-[11px] leading-4 font-medium tracking-[0.1em] text-[var(--fg3)] uppercase" style={{ fontFamily: "var(--mono)" }}>
                {hover != null ? `Month ${hover} · ${duration(hover)}` : `Projected value · year ${s.years}`}
              </div>
              <div className="pf-hero-fig mt-1">
                <AnimatedNumber value={kind === "nominal" ? activeBase.nominal : activeBase.real} format={fmt} durationMs={hover != null ? 120 : 700} />
              </div>
              <div className="mt-2 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--fg2)]" style={{ fontFamily: "var(--mono)" }} aria-hidden>
                <span className="inline-flex items-center gap-1.5"><i className="inline-block h-[2px] w-4 rounded bg-[var(--pf-accent)]" />Base {s.expectedAnnualReturnPct.toFixed(1)}% <b className="font-medium text-[var(--fg)]">{usdCompact(sc.base.points[Math.min(active, months)]![kind])}</b></span>
                <span className="inline-flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dotted border-[var(--fg3)]" />Conservative {sc.conservative.inputs.expectedAnnualReturnPct.toFixed(1)}% <b className="font-medium text-[var(--fg)]">{usdCompact(sc.conservative.points[Math.min(active, months)]![kind])}</b></span>
                <span className="inline-flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dashed border-[var(--fg3)]" />Optimistic {sc.optimistic.inputs.expectedAnnualReturnPct.toFixed(1)}% <b className="font-medium text-[var(--fg)]">{usdCompact(sc.optimistic.points[Math.min(active, months)]![kind])}</b></span>
              </div>
            </div>
            <div className="px-2 pb-3 sm:px-3">
              <WealthChart set={sc} kind={kind} target={target} targetMonth={sum.monthsToTarget} ariaLabel={ariaLabel} onHover={setHover} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hair)] px-[var(--ins)] py-2.5">
              <MiniField label="Scenario spread (± points)" value={s.spread} decimals={1} suffix="pts" onChange={(v) => set("spread", Math.max(0, Math.min(10, v)))} />
              <span className="text-[12px] text-[var(--fg3)]">Hover, touch or use ← → to scrub</span>
            </div>
            <div className="pf-stats wl-stats">
              <Stat k="Contributions" value={<AnimatedNumber value={sum.totalContributions} format={fmt} />} sub={`${usd(s.monthlyContribution)}/mo + ${s.annualContributionGrowthPct}%/yr`} />
              <Stat k="Growth" value={<AnimatedNumber value={sum.totalGrowth} format={fmt} />} sub="Returns on top of what you put in" />
              <Stat k="In today's dollars" value={<AnimatedNumber value={sum.finalReal} format={fmt} />} sub={`After ${s.inflationPct}%/yr inflation`} />
              <Stat k="Years to target" value={<span>{targetLabel}</span>} sub={targetNote} />
              <Stat k="Progress" value={sum.progress == null ? <span>—</span> : <AnimatedNumber value={sum.progress} format={fmtPct} />} sub={target > 0 ? `of ${usdCompact(target)} by year ${s.years}` : "Set a target"} />
            </div>
          </section>

          <section className="pf-panel" aria-label="What if">
            <div className="pf-ph"><span className="pf-label">What if <em>answered with your assumptions</em></span></div>
            <div className="wl-qgrid">
              <div className="wl-q">
                <h2 className="text-[14px] font-medium text-[var(--fg)]">How much a month to reach the target by year {s.askYears}?</h2>
                <div className="mt-3"><MiniField label="By year" value={s.askYears} suffix="yrs" onChange={(v) => set("askYears", Math.max(1, Math.min(50, Math.round(v))))} /></div>
                <div className="pf-serif mt-4 text-[34px] leading-none tracking-[-0.03em] text-[var(--fg)]">
                  {target <= 0 ? <span className="text-[18px] text-[var(--fg3)]">Set a target</span> : needed == null ? "—" : <AnimatedNumber value={needed} format={(v) => `${usd(v)}/mo`} />}
                </div>
                <p className="mt-2 text-[12px] leading-4 text-[var(--fg3)]">
                  {target <= 0 ? "Pick a target on the left." : needed === 0 ? "Your starting value alone gets there." : `vs ${usd(s.monthlyContribution)}/mo now. Rises ${s.annualContributionGrowthPct}% a year after the first.`}
                </p>
              </div>
              <div className="wl-q">
                <h2 className="text-[14px] font-medium text-[var(--fg)]">How much earlier if I add {usd(s.askExtra)}/month?</h2>
                <div className="mt-3"><MiniField label="Extra per month" prefix="$" value={s.askExtra} onChange={(v) => set("askExtra", Math.max(0, v))} /></div>
                <div className="pf-serif mt-4 text-[34px] leading-none tracking-[-0.03em] text-[var(--fg)]">
                  {saved == null ? <span className="text-[18px] text-[var(--fg3)]">Set a target</span> : saved.onlyWithExtra ? <span className="text-[22px]">Only with the extra</span> : saved.monthsSaved == null ? "—" : saved.monthsSaved === 0 ? "No change" : duration(saved.monthsSaved)}
                </div>
                <p className="mt-2 text-[12px] leading-4 text-[var(--fg3)]">
                  {saved == null ? "Pick a target on the left." : saved.withExtraMonths == null ? "Target not reached within 100 years either way." : `Target in ${duration(saved.withExtraMonths)}${saved.baseMonths != null ? `, instead of ${duration(saved.baseMonths)}` : ` (not reachable without it)`}.`}
                </p>
              </div>
              <div className="wl-q">
                <h2 className="text-[14px] font-medium text-[var(--fg)]">What if returns average {s.askReturn}% instead?</h2>
                <div className="mt-3"><MiniField label="Average return" suffix="%/yr" decimals={1} value={s.askReturn} onChange={(v) => set("askReturn", Math.max(-50, Math.min(30, v)))} /></div>
                <div className="pf-serif mt-4 text-[34px] leading-none tracking-[-0.03em] text-[var(--fg)]">
                  <AnimatedNumber value={alt.summary.finalNominal} format={fmt} />
                </div>
                <p className="mt-2 text-[12px] leading-4 text-[var(--fg3)]">
                  {(() => {
                    const diff = alt.summary.finalNominal - sum.finalNominal
                    const head = `${diff >= 0 ? "+" : "−"}${usd(Math.abs(diff))} vs your ${s.expectedAnnualReturnPct}% case`
                    return target > 0 ? `${head}. Target ${altMonths == null ? "not reached in 100 years" : `in ${duration(altMonths)}`}.` : `${head}.`
                  })()}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-[12px] leading-4 text-[var(--fg3)]">
        Hypothetical projections computed from the assumptions you enter. They are not predictions or advice: real returns vary, can be negative, and are not guaranteed. Contributions are added at month end and rise once a year.
      </p>
    </div>
  )
}

function Stat({ k, value, sub }: { k: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="pf-stat">
      <div className="k">{k}</div>
      <div className="pf-serif mt-1.5 text-[24px] leading-[1.15] tracking-[-0.02em] text-[var(--fg)] [font-variant-numeric:lining-nums_tabular-nums]">{value}</div>
      <div className="s">{sub}</div>
    </div>
  )
}
