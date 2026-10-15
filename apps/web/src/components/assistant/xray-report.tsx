"use client"

import { motion, useReducedMotion } from "motion/react"
import { useEffect, useId, useState } from "react"
import { Bookmark, BookmarkCheck, ChevronRight, ArrowUpRight } from "lucide-react"
import { formatCurrency, formatDate, formatPercent } from "@web/lib/format"
import type { XRay } from "@web/lib/ai/portfolio-xray"
import { chipsOf, flagsOf, verdictOf, type FlagView } from "@web/lib/ai/xray-view"

const SLICE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-7)"]
const NEUTRAL = "color-mix(in srgb, var(--fg3) 55%, transparent)"
const MUTED = "color-mix(in srgb, var(--fg3) 28%, transparent)"
const pct = (n: number) => `${n.toFixed(1)}%`
const tone = (n: number) => (n > 0 ? "var(--gain)" : n < 0 ? "var(--loss)" : "var(--fg2)")
const arrow = (n: number) => (n > 0 ? "▲" : n < 0 ? "▼" : "")
const SHOWN_FLAGS = 3

const RANGE_DAYS: Record<string, number> = { "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365 }
const RANGE_NAME: Record<string, string> = { "1W": "week", "1M": "month", "3M": "3 months", "6M": "6 months", "1Y": "year" }

/** The window is named for what it actually covers: a portfolio tracked for 16 days has no "past 3 months". */
function periodShort(period: { range: string; days: number }) {
  const full = RANGE_DAYS[period.range]
  return full != null && period.days < full * 0.85
}
function periodLabel(period: { range: string; days: number } | null) {
  if (!period) return "Period"
  return periodShort(period) ? "Since tracking began" : `Past ${RANGE_NAME[period.range] ?? period.range}`
}
function periodNote(period: { range: string; days: number }) {
  return periodShort(period) ? `${period.days} tracked days` : undefined
}


/** The hero number counts up once when the report arrives, so it reads as computed, not pasted. Off for reduced motion. */
function useCountUp(target: number, ms = 600) {
  const reduce = useReducedMotion()
  const [value, setValue] = useState(reduce ? target : 0)
  useEffect(() => {
    if (reduce) return setValue(target)
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      setValue(target * (1 - Math.pow(1 - t, 3)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, ms, reduce])
  return value
}

function Stat({ label, amount, percent, note }: { label: string; amount?: number; percent: number | null; note?: string }) {
  const basis = percent ?? amount ?? 0
  return (
    <div className="pf-x2-stat">
      <span className="pf-x2-k">{label}</span>
      <span className="pf-x2-v" style={{ color: tone(basis) }}>
        {percent != null ? (
          <>
            <span aria-hidden>{arrow(percent)} </span>
            {formatPercent(percent)}
          </>
        ) : (
          "—"
        )}
      </span>
      <span className="pf-x2-s">{amount != null ? formatCurrency(amount) : note ?? ""}</span>
    </div>
  )
}

/** A figure against its rule-of-thumb line: where you are, and where the line sits. */
function Meter({ value, line, open }: { value: number; line: number; open: boolean }) {
  const max = Math.max(100, value, line)
  return (
    <div className="pf-x2-meter">
      <div className="pf-x2-meter-t">
        <i style={{ width: `${(Math.min(value, max) / max) * 100}%`, transform: open ? "scaleX(1)" : "scaleX(0)" }} />
        <u style={{ left: `${(line / max) * 100}%` }} />
      </div>
      <div className="pf-x2-meter-l">
        <span>0%</span>
        <span>
          Rule of thumb {line}% · you {pct(value)}
        </span>
      </div>
    </div>
  )
}

function Flag({ flag, open, onToggle, onAsk }: { flag: FlagView; open: boolean; onToggle: () => void; onAsk: (q: string) => void }) {
  const id = useId()
  return (
    <li className={`pf-x2-row ${open ? "is-open" : ""}`}>
      <button type="button" className="pf-x2-row-b" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <i className={`pf-x2-sev is-${flag.severity}`} aria-hidden />
        <span className="pf-x2-row-t">
          <b>{flag.title}</b>
          {flag.subtitle ? <small>{flag.subtitle}</small> : null}
        </span>
        {flag.metric ? <span className="pf-x2-row-m">{flag.metric}</span> : null}
        <ChevronRight size={13} className="pf-x2-chev" aria-hidden />
      </button>
      <div className="pf-x2-reveal" id={id} role="region" aria-hidden={!open}>
        <div inert={!open}>
          <div className="pf-x2-why">
            <p>{flag.explanation}</p>
            {flag.threshold ? <Meter value={flag.threshold.value} line={flag.threshold.line} open={open} /> : null}
            <button type="button" className="pf-x2-ask" onClick={() => onAsk(flag.followUp)}>
              {flag.followUp}
              <ArrowUpRight size={11} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}

/** A quiet section that folds away behind a one-line preview of what is inside. */
function Fold({ title, preview, children }: { title: string; preview: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className={`pf-x2-fold ${open ? "is-open" : ""}`}>
      <button type="button" className="pf-x2-fold-b" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="pf-x2-fold-k">{title}</span>
        <span className="pf-x2-fold-p">{preview}</span>
        <ChevronRight size={13} className="pf-x2-chev" aria-hidden />
      </button>
      <div className="pf-x2-reveal" id={id} role="region" aria-hidden={!open}>
        <div inert={!open}>
          <div className="pf-x2-fold-body">{children}</div>
        </div>
      </div>
    </div>
  )
}

/**
 * The X-Ray as a briefing: the answer first (value, one sentence, three figures), the few things worth a look
 * as rows that open in place, and the detail folded away. Every figure comes from the server's result; the
 * words are derived from it in `xray-view`.
 */
export function XRayReport({ xray, onAsk, onSave }: { xray: XRay; onAsk: (question: string) => void; onSave?: () => void }) {
  const [saved, setSaved] = useState(false)
  const [openFlag, setOpenFlag] = useState<string | null>(null)
  const [allFlags, setAllFlags] = useState(false)
  const { overview, allocation, sectors, concentration: c, performance: p } = xray
  const hero = useCountUp(overview.totalValue)

  let sectorRank = 0
  const sectorColor = (kind: "sector" | "bucket" | "unclassified") => (kind === "unclassified" ? MUTED : kind === "bucket" ? NEUTRAL : sectorRank < 5 ? SLICE_COLORS[sectorRank++] : "var(--fg2)")
  const sectorSlices = sectors.slices.map((sl) => ({ ...sl, color: sectorColor(sl.kind) }))
  const bars = [
    { k: "Largest holding", v: c.top1 },
    { k: "Top 3", v: c.top3 },
    { k: "Top 5", v: c.top5 },
  ]

  if (overview.holdingCount === 0) {
    return (
      <div className="pf-art pf-x2" role="region" aria-label="Portfolio X-Ray report">
        <div className="pf-art-h">
          <span className="pf-art-l">Portfolio X-Ray</span>
        </div>
        <p className="pf-x2-empty">There are no positions to analyze yet. Connect a brokerage or add positions to a manual account and run this again.</p>
      </div>
    )
  }

  const flags = flagsOf(xray)
  const shown = allFlags ? flags : flags.slice(0, SHOWN_FLAGS)
  const chips = chipsOf(xray)
  const top = overview.largest.slice(0, 2).map((h) => h.ticker ?? h.name).join(", ")
  const leadSector = sectors.largest

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 32, delay: 0.14 }}>
      <div className="pf-art pf-art-ai pf-x2" role="region" aria-label="Portfolio X-Ray report">
        <div className="pf-art-h">
          <span className="pf-art-l">Portfolio X-Ray</span>
          <span className="pf-art-end">
            {xray.asOf ? `As of ${formatDate(xray.asOf, "short")}` : null}
            {onSave ? (
              <button
                type="button"
                className="pf-xr-save"
                disabled={saved}
                onClick={() => {
                  onSave()
                  setSaved(true)
                }}
                title="Keep this report in this browser"
              >
                {saved ? <BookmarkCheck size={12} aria-hidden /> : <Bookmark size={12} aria-hidden />}
                {saved ? "Saved" : "Save"}
              </button>
            ) : null}
          </span>
        </div>

        <div className="pf-x2-verdict">
          <span className="pf-x2-fig">{formatCurrency(hero)}</span>
          <span className="pf-x2-figs">
            {overview.holdingCount} {overview.holdingCount === 1 ? "holding" : "holdings"}
            {overview.positionCount !== overview.holdingCount ? ` · ${overview.positionCount} positions` : ""}
          </span>
          <p className="pf-x2-say">{verdictOf(xray)}</p>
        </div>

        <div className="pf-x2-stats">
          <Stat label="Today" percent={p.today?.percent ?? null} amount={p.today?.amount} note="Not enough history" />
          <Stat label={p.period && periodShort(p.period) ? "Since start" : periodLabel(p.period)} percent={p.period?.percent ?? null} note={p.period ? periodNote(p.period) : "Needs more history"} />
          <Stat label="Since buying" percent={p.allTime?.percent ?? null} amount={p.allTime?.amount} note="No cost basis" />
        </div>

        <div className="pf-x2-sech">
          <span>Worth a look</span>
          <em>{flags.length === 0 ? "none" : flags.length}</em>
        </div>
        {flags.length === 0 ? (
          <p className="pf-x2-none">Nothing stands out against the checks Peerfolio runs: no single holding or small group dominates.</p>
        ) : (
          <ul className="pf-x2-look">
            {shown.map((f) => (
              <Flag key={f.id} flag={f} open={openFlag === f.id} onToggle={() => setOpenFlag(openFlag === f.id ? null : f.id)} onAsk={onAsk} />
            ))}
          </ul>
        )}
        {flags.length > SHOWN_FLAGS && !allFlags ? (
          <button type="button" className="pf-x2-more" onClick={() => setAllFlags(true)}>
            Show {flags.length - SHOWN_FLAGS} more
          </button>
        ) : null}

        <Fold
          title="Allocation"
          preview={
            <>
              <span className="pf-x2-mini" aria-hidden>
                {allocation.map((a, i) => (
                  <i key={a.name} style={{ background: SLICE_COLORS[i % SLICE_COLORS.length], flexGrow: a.percent }} />
                ))}
              </span>
              {allocation.slice(0, 2).map((a) => `${a.name} ${Math.round(a.percent)}%`).join(" · ")}
            </>
          }
        >
          <div className="pf-xr-stack" role="img" aria-label={allocation.map((a) => `${a.name} ${pct(a.percent)}`).join(", ")}>
            {allocation.map((a, i) => (
              <span key={a.name} className="pf-xr-seg" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length], flexGrow: a.percent }} title={`${a.name} ${pct(a.percent)}`} />
            ))}
          </div>
          <ul className="pf-xr-legend">
            {allocation.map((a, i) => (
              <li key={a.name}>
                <i style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                <span>{a.name}</span>
                <b>{pct(a.percent)}</b>
              </li>
            ))}
          </ul>
        </Fold>

        <Fold title="Concentration" preview={`Top 5 = ${pct(c.top5)}`}>
          <div className="pf-xr-bars">
            {bars.map((b) => (
              <div key={b.k} className="pf-xr-bar">
                <span>{b.k}</span>
                <div className="pf-xr-track">
                  <i style={{ width: `${Math.min(100, b.v)}%` }} />
                </div>
                <b>{pct(b.v)}</b>
              </div>
            ))}
          </div>
          <p className="pf-xr-note">
            Weighted like about <b>{c.effectiveHoldings.toFixed(1)}</b> equal-sized holdings. Individual stocks are {pct(c.singleStockWeight)} of the total.
          </p>
        </Fold>

        <Fold title="Sectors" preview={leadSector ? `${leadSector.name} ${Math.round(leadSector.percentOfClassified)}% of classified` : sectors.coverage == null ? "No stocks" : "Not available yet"}>
          <div className="pf-xr-stack" role="img" aria-label={sectorSlices.map((a) => `${a.name} ${pct(a.percent)}`).join(", ")}>
            {sectorSlices.map((a) => (
              <span key={a.name} className="pf-xr-seg" style={{ background: a.color, flexGrow: a.percent }} title={`${a.name} ${pct(a.percent)}`} />
            ))}
          </div>
          <ul className="pf-xr-legend">
            {sectorSlices.map((a) => (
              <li key={a.name}>
                <i style={{ background: a.color }} />
                <span>{a.name}</span>
                <b>{pct(a.percent)}</b>
              </li>
            ))}
          </ul>
          <p className="pf-xr-note">
            {sectors.coverage == null
              ? "No individual stocks to show sectors for. "
              : sectors.stocks.classifiedValue === 0
                ? "Sector data for your stocks isn't available yet. "
                : sectors.partial
                  ? `Partial: sector data covers ${pct(sectors.coverage)} of your stock value. `
                  : ""}
            Funds, crypto and cash aren&apos;t broken into sectors; fund look-through isn&apos;t available.
          </p>
        </Fold>

        <Fold title="Largest positions" preview={top}>
          <ul className="pf-xr-top5">
            {overview.largest.map((h) => (
              <li key={h.ticker ?? h.name}>
                <span className="pf-xr-tk">{h.ticker ?? h.name}</span>
                <span className="pf-xr-nm">{h.ticker ? h.name : ""}</span>
                <span className="pf-xr-w">{pct(h.weight)}</span>
                <span className="pf-xr-val">{formatCurrency(h.value)}</span>
              </li>
            ))}
          </ul>
        </Fold>

        {p.risk && (p.risk.maxDrawdown != null || p.risk.worst || p.movers.length > 0) ? (
          <Fold title="Moves and risk" preview={p.risk?.maxDrawdown != null ? `Largest drop ${pct(p.risk.maxDrawdown)}` : p.movers[0] ? `${p.movers[0].ticker ?? p.movers[0].name} moved most today` : ""}>
            {p.risk.volatility != null || p.risk.maxDrawdown != null || p.risk.worst ? (
              <div className="pf-xr-risk">
                {p.risk.volatility != null ? (
                  <div><span className="pf-xr-k">Swing</span><span className="pf-xr-rv">{pct(p.risk.volatility)}<em> a year</em></span></div>
                ) : null}
                {p.risk.maxDrawdown != null ? (
                  <div><span className="pf-xr-k">Largest drop</span><span className="pf-xr-rv">{pct(p.risk.maxDrawdown)}<em> peak to trough</em></span></div>
                ) : null}
                {p.risk.worst ? (
                  <div><span className="pf-xr-k">Worst day</span><span className="pf-xr-rv" style={{ color: tone(p.risk.worst.percent) }}>{formatPercent(p.risk.worst.percent)}<em> {formatDate(p.risk.worst.date, "short")}</em></span></div>
                ) : null}
              </div>
            ) : null}
            {p.movers.length > 0 ? (
              <p className="pf-xr-note">
                Biggest movers today:{" "}
                {p.movers.map((m, i) => (
                  <span key={m.ticker ?? m.name ?? i}>
                    {i > 0 ? ", " : ""}
                    <b>{m.ticker ?? m.name}</b> <span style={{ color: tone(m.todayAmount) }}>{m.todayAmount > 0 ? "+" : "−"}{formatCurrency(Math.abs(m.todayAmount))}</span>
                  </span>
                ))}
              </p>
            ) : null}
          </Fold>
        ) : null}

        <details className="pf-x2-lim">
          <summary>What this can&apos;t see</summary>
          <ul>
            {xray.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p>Observations from your stored holdings, not investment advice.</p>
        </details>
      </div>

      {chips.length > 0 ? (
        <div className="pf-x2-chips" aria-label="Ask next">
          {chips.map((q) => (
            <button key={q} type="button" className="pf-x2-chip" onClick={() => onAsk(q)}>
              {q}
            </button>
          ))}
        </div>
      ) : null}
    </motion.div>
  )
}
