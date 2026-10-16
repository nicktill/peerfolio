"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { formatPercent } from "@web/lib/format"
import { linePath, type Visual } from "@web/lib/ai/visuals"

const tone = (v: number) => (v > 0 ? "is-up" : v < 0 ? "is-down" : "")
const WHEN: Record<string, string> = { "before-open": "before open", "after-close": "after close", during: "during", unknown: "" }

/** A bar from the centre line: right for gains, left for losses, scaled to the largest move shown. */
function Spread({ rows }: { rows: { name: string; v: number }[] }) {
  const max = Math.max(0.1, ...rows.map((r) => Math.abs(r.v)))
  return (
    <ul className="pf-vz-spread">
      {rows.map((r) => (
        <li key={r.name}>
          <span className="pf-vz-n">{r.name}</span>
          <span className="pf-vz-track" aria-hidden>
            <motion.i className={tone(r.v)} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} style={{ width: `${(Math.abs(r.v) / max) * 50}%`, [r.v >= 0 ? "left" : "right"]: "50%", transformOrigin: r.v >= 0 ? "left" : "right" }} />
          </span>
          <span className={`pf-vz-v ${tone(r.v)}`}>{formatPercent(r.v)}</span>
        </li>
      ))}
    </ul>
  )
}

const TITLES: Record<Visual["kind"], string> = { market: "Market today", movers: "Biggest movers", earnings: "Earnings", benchmark: "You vs the market" }

function Body({ v }: { v: Visual }) {
  if (v.kind === "market") {
    const sectors = [...v.sectors].sort((a, b) => b.dayPercent - a.dayPercent)
    const shown = sectors.length > 6 ? [...sectors.slice(0, 3), ...sectors.slice(-3)] : sectors
    return (
      <>
        <div className="pf-vz-tiles">
          {v.indexes.map((i) => (
            <div key={i.name}>
              <span>{i.name}</span>
              <b className={tone(i.dayPercent)}>{formatPercent(i.dayPercent)}</b>
            </div>
          ))}
        </div>
        {shown.length > 0 ? <Spread rows={shown.map((s) => ({ name: s.name, v: s.dayPercent }))} /> : null}
      </>
    )
  }
  if (v.kind === "movers") {
    const col = (title: string, rows: typeof v.gainers) =>
      rows.length === 0 ? null : (
        <div>
          <span className="pf-vz-sub">{title}</span>
          <ul className="pf-vz-list">
            {rows.map((r) => (
              <li key={r.symbol}>
                <span>
                  {r.symbol}
                  {r.held ? <em title="You hold this">held</em> : null}
                </span>
                <b className={tone(r.changePercent)}>{formatPercent(r.changePercent)}</b>
              </li>
            ))}
          </ul>
        </div>
      )
    return (
      <div className="pf-vz-cols">
        {col("Gainers", v.gainers)}
        {col("Losers", v.losers)}
      </div>
    )
  }
  if (v.kind === "earnings") {
    return (
      <ul className="pf-vz-days">
        {v.days.map((d) => (
          <li key={d.day}>
            <span className="pf-vz-day">{d.day}</span>
            <span className="pf-vz-chips">
              {d.reports.map((r) => (
                <span key={r.symbol} className={r.held ? "is-held" : ""} title={WHEN[r.when] || undefined}>
                  {r.symbol}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    )
  }
  const all = v.lines ? [...v.lines.you, ...v.lines.bench] : []
  const min = Math.min(...all)
  const max = Math.max(...all)
  return (
    <>
      {v.lines ? (
        <>
          <div className="pf-vz-key" aria-hidden>
            <span>
              <i />
              You
            </span>
            <span>
              <i className="is-bench" />
              {v.label}
            </span>
          </div>
          <svg className="pf-vz-lines" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`You ${formatPercent(v.you)} against ${v.label} ${formatPercent(v.benchmark)} over ${v.range}`}>
            <motion.path className="is-bench" d={linePath(v.lines.bench, min, max)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} />
            <motion.path className="is-you" d={linePath(v.lines.you, min, max)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.1 }} />
          </svg>
        </>
      ) : null}
      <Spread
        rows={[
          { name: "You", v: v.you },
          { name: v.label, v: v.benchmark },
        ]}
      />
      <p className="pf-vz-note">Over {v.range}, deposits removed. Benchmark leaves out dividends.</p>
    </>
  )
}

/** One compact card per visual. One that already appeared earlier in the chat folds to a single line. */
export function VisualCard({ v, repeat = false }: { v: Visual; repeat?: boolean }) {
  const [open, setOpen] = useState(!repeat)
  return (
    <motion.section className="pf-vz" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} aria-label={TITLES[v.kind]}>
      {repeat && !open ? (
        <button type="button" className="pf-vz-fold" onClick={() => setOpen(true)} aria-expanded={false}>
          <span className="pf-xr-label">{TITLES[v.kind]}</span>
          <span>Show again</span>
        </button>
      ) : (
        <>
          <header>
            <span className="pf-xr-label">{TITLES[v.kind]}</span>
          </header>
          <Body v={v} />
        </>
      )}
    </motion.section>
  )
}
