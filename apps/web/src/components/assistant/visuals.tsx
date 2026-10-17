"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { formatCurrency, formatPercent } from "@web/lib/format"
import { linePath, type Visual } from "@web/lib/ai/visuals"

const tone = (v: number) => (v > 0 ? "is-up" : v < 0 ? "is-down" : "")
const WHEN: Record<string, string> = { "before-open": "before open", "after-close": "after close", during: "during", unknown: "" }

/** A bar from the centre line: right for gains, left for losses, scaled to the largest move shown. */
function Spread({ rows, format = formatPercent }: { rows: { name: string; v: number }[]; format?: (n: number) => string }) {
  const max = Math.max(0.1, ...rows.map((r) => Math.abs(r.v)))
  return (
    <ul className="pf-vz-spread">
      {rows.map((r) => (
        <li key={r.name}>
          <span className="pf-vz-n">{r.name}</span>
          <span className="pf-vz-track" aria-hidden>
            <motion.i className={tone(r.v)} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} style={{ width: `${(Math.abs(r.v) / max) * 50}%`, [r.v >= 0 ? "left" : "right"]: "50%", transformOrigin: r.v >= 0 ? "left" : "right" }} />
          </span>
          <span className={`pf-vz-v ${tone(r.v)}`}>{format(r.v)}</span>
        </li>
      ))}
    </ul>
  )
}

const TITLES: Record<Visual["kind"], string> = {
  market: "Market today",
  movers: "Biggest movers",
  earnings: "Earnings",
  benchmark: "You vs the market",
  risk: "Concentration",
  breakdown: "Breakdown",
  performance: "Performance",
  contributors: "What moved today",
  holding: "Holding",
  compare: "Side by side",
  donut: "Allocation",
  stats: "At a glance",
  scenario: "What if",
  checklist: "Checklist",
  timeline: "Timeline",
  calendar: "Calendar",
}
const titleOf = (v: Visual) => ("title" in v ? v.title : v.kind === "holding" ? v.name : TITLES[v.kind])
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${formatCurrency(Math.abs(n))}`
const pc1 = (n: number) => `${n.toFixed(1)}%`

/** Horizontal share bars on a 0-100 scale; a tick marks the rule-of-thumb line where there is one, and the bar warms past it. */
function Shares({ rows }: { rows: { name: string; percent: number; line?: number | null }[] }) {
  return (
    <ul className="pf-vz-shares">
      {rows.map((r, i) => (
        <li key={r.name}>
          <span className="pf-vz-n">{r.name}</span>
          <span className="pf-vz-track pf-vz-fill" aria-hidden>
            <motion.i className={r.line != null && r.percent >= r.line ? "is-over" : ""} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.5, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }} style={{ width: `${Math.min(100, r.percent)}%` }} />
            {r.line != null ? <b className="pf-vz-line" style={{ left: `${r.line}%` }} /> : null}
          </span>
          <span className="pf-vz-v">{pc1(r.percent)}</span>
        </li>
      ))}
    </ul>
  )
}

const RAMP = [1, 0.74, 0.54, 0.4, 0.28, 0.18, 0.12, 0.08]

/** A ring of shares with its legend; the headline sits in the hole. */
function Donut({ v }: { v: Extract<Visual, { kind: "donut" }> }) {
  const total = v.slices.reduce((n, s) => n + s.percent, 0) || 1
  const R = 15.9155
  let acc = 0
  return (
    <div className="pf-vz-donut">
      <div className="pf-vz-ring">
        <svg viewBox="0 0 42 42" role="img" aria-label={v.slices.map((s) => `${s.name} ${pc1(s.percent)}`).join(", ")}>
          <circle cx="21" cy="21" r={R} className="pf-vz-ring-bg" />
          {v.slices.map((sl, i) => {
            const len = (sl.percent / total) * 100
            const el = (
              <motion.circle key={sl.name} cx="21" cy="21" r={R} className="pf-vz-ring-seg" strokeDasharray={`${Math.max(0, len - 0.6)} ${100 - Math.max(0, len - 0.6)}`} strokeDashoffset={25 - acc} style={{ opacity: RAMP[i] ?? 0.08 }} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: i * 0.05 }} />
            )
            acc += len
            return el
          })}
        </svg>
        {v.centre ? (
          <span>
            <small>{v.centre.label}</small>
            <b>{v.centre.value}</b>
          </span>
        ) : null}
      </div>
      <ul className="pf-vz-legend">
        {v.slices.map((sl, i) => (
          <li key={sl.name}>
            <i style={{ opacity: RAMP[i] ?? 0.08 }} />
            <span>{sl.name}</span>
            <b>{pc1(sl.percent)}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A what-if slider: drag a percent move and see what it does to the value. Nothing is saved or sent. */
function Scenario({ v }: { v: Extract<Visual, { kind: "scenario" }> }) {
  const [pct, setPct] = useState(v.start)
  const delta = (v.base * v.exposure * pct) / 10000
  const id = `pf-sc-${v.subject.replace(/\W/g, "")}`
  return (
    <div className="pf-vz-scn">
      <label htmlFor={id}>
        If <b>{v.subject}</b> moves
        <output className={tone(pct)}>{pct > 0 ? "+" : pct < 0 ? "−" : ""}{Math.abs(pct)}%</output>
      </label>
      <input id={id} type="range" min={-50} max={50} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} />
      <div className="pf-vz-tiles">
        <div>
          <span>Your total</span>
          <b>{formatCurrency(v.base + delta)}</b>
        </div>
        <div>
          <span>Change</span>
          <b className={tone(delta)}>{signed(delta)}</b>
        </div>
        <div>
          <span>Of your portfolio</span>
          <b className={tone(delta)}>{formatPercent((delta / (v.base || 1)) * 100, 1)}</b>
        </div>
      </div>
      <p className="pf-vz-note">Simple arithmetic on today&apos;s weights: {v.subject} is {pc1(v.exposure)} of the total. Not a forecast.</p>
    </div>
  )
}

function Checklist({ v }: { v: Extract<Visual, { kind: "checklist" }> }) {
  const [done, setDone] = useState<Set<number>>(new Set())
  return (
    <ul className="pf-vz-check">
      {v.items.map((it, i) => (
        <li key={i} className={done.has(i) ? "is-done" : ""}>
          <label>
            <input type="checkbox" checked={done.has(i)} onChange={() => setDone((d) => { const n = new Set(d); if (n.has(i)) n.delete(i); else n.add(i); return n })} />
            <span>
              {it.text}
              {it.detail ? <small>{it.detail}</small> : null}
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}

function Body({ v }: { v: Visual }) {
  if (v.kind === "donut") return <Donut v={v} />
  if (v.kind === "scenario") return <Scenario v={v} />
  if (v.kind === "checklist") return <Checklist v={v} />
  if (v.kind === "stats") {
    return (
      <div className="pf-vz-tiles pf-vz-stats">
        {v.stats.map((t) => (
          <div key={t.label}>
            <span>{t.label}</span>
            <b>{t.value}</b>
            {t.detail ? <small>{t.detail}</small> : null}
          </div>
        ))}
      </div>
    )
  }
  if (v.kind === "timeline") {
    return (
      <ol className="pf-vz-tl">
        {v.events.map((e, i) => (
          <li key={i}>
            <span className="pf-vz-when">{e.when}</span>
            <span>
              <b>{e.title}</b>
              {e.detail ? <small>{e.detail}</small> : null}
            </span>
          </li>
        ))}
      </ol>
    )
  }
  if (v.kind === "calendar") {
    const total = v.entries.reduce((n, e) => n + (e.amount ?? 0), 0)
    return (
      <>
        <ul className="pf-vz-cal">
          {v.entries.map((e, i) => (
            <li key={i}>
              <span className="pf-vz-when">{e.date}</span>
              <span>{e.label}</span>
              <b>{e.amount == null ? "" : formatCurrency(e.amount)}</b>
            </li>
          ))}
        </ul>
        {total > 0 ? <p className="pf-vz-note">Total {formatCurrency(total)}</p> : null}
      </>
    )
  }
  if (v.kind === "risk") {
    return (
      <>
        <Shares rows={v.bars.map((b) => ({ name: b.label, percent: b.percent, line: b.line }))} />
        <p className="pf-vz-note">Ticks are rules of thumb, not limits. Single stocks and sectors are shares of your portfolio and of your stocks.</p>
      </>
    )
  }
  if (v.kind === "breakdown") {
    return (
      <>
        <Shares rows={v.rows} />
        {v.note ? <p className="pf-vz-note">{v.note}</p> : null}
      </>
    )
  }
  if (v.kind === "performance") {
    return (
      <>
        <div className="pf-vz-tiles">
          {v.tiles.map((t) => (
            <div key={t.label}>
              <span>{t.label}</span>
              <b className={t.percent == null ? "" : tone(t.percent)}>{t.percent == null ? "–" : formatPercent(t.percent)}</b>
              {t.amount != null ? <small className={tone(t.amount)}>{signed(t.amount)}</small> : null}
            </div>
          ))}
        </div>
        {v.risk ? (
          <dl className="pf-vz-facts">
            {v.risk.volatility != null ? (
              <div>
                <dt>Volatility</dt>
                <dd>{pc1(v.risk.volatility)}</dd>
              </div>
            ) : null}
            {v.risk.maxDrawdown != null ? (
              <div>
                <dt>Worst drawdown</dt>
                <dd>{pc1(v.risk.maxDrawdown)}</dd>
              </div>
            ) : null}
            {v.best != null ? (
              <div>
                <dt>Best day</dt>
                <dd className="is-up">{formatPercent(v.best)}</dd>
              </div>
            ) : null}
            {v.worst != null ? (
              <div>
                <dt>Worst day</dt>
                <dd className="is-down">{formatPercent(v.worst)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </>
    )
  }
  if (v.kind === "contributors") {
    return (
      <>
        <Spread rows={v.rows.map((r) => ({ name: r.name, v: r.amount }))} format={signed} />
        {v.total != null ? <p className="pf-vz-note">Portfolio today: {signed(v.total)}.</p> : null}
      </>
    )
  }
  if (v.kind === "holding") {
    return (
      <>
        <div className="pf-vz-hero">
          <b>{pc1(v.weight)}</b>
          <span>of your portfolio · #{v.rank} holding</span>
        </div>
        <Shares rows={[{ name: "Weight", percent: v.weight, line: v.line }]} />
        <dl className="pf-vz-facts">
          <div>
            <dt>Value</dt>
            <dd>{formatCurrency(v.value)}</dd>
          </div>
          {v.todayAmount != null ? (
            <div>
              <dt>Today</dt>
              <dd className={tone(v.todayAmount)}>{signed(v.todayAmount)}</dd>
            </div>
          ) : null}
        </dl>
        <p className="pf-vz-note">The tick at {v.line}% is a rule of thumb for one position. A broad fund counts differently from a single company.</p>
      </>
    )
  }
  if (v.kind === "compare") {
    return (
      <table className="pf-vz-table">
        <thead>
          <tr>
            <th />
            {v.rows.map((r) => (
              <th key={r.name}>{r.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Weight</th>
            {v.rows.map((r) => (
              <td key={r.name}>{pc1(r.weight)}</td>
            ))}
          </tr>
          <tr>
            <th>Value</th>
            {v.rows.map((r) => (
              <td key={r.name}>{formatCurrency(r.value, { compact: true })}</td>
            ))}
          </tr>
          <tr>
            <th>Today</th>
            {v.rows.map((r) => (
              <td key={r.name} className={r.todayAmount == null ? "" : tone(r.todayAmount)}>
                {r.todayAmount == null ? "–" : signed(r.todayAmount)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    )
  }
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
    <motion.section className="pf-vz" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} aria-label={titleOf(v)}>
      {repeat && !open ? (
        <button type="button" className="pf-vz-fold" onClick={() => setOpen(true)} aria-expanded={false}>
          <span className="pf-xr-label">{titleOf(v)}</span>
          <span>Show again</span>
        </button>
      ) : (
        <>
          <header>
            <span className="pf-xr-label">{titleOf(v)}</span>
          </header>
          <Body v={v} />
        </>
      )}
    </motion.section>
  )
}
