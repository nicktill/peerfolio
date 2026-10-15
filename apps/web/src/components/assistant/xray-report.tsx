"use client"

import { motion, type Variants } from "motion/react"
import { AlertTriangle, ArrowUpRight, Eye, Info } from "lucide-react"
import { formatCurrency, formatDate, formatPercent } from "@web/lib/format"
import type { Insight, XRay } from "@web/lib/ai/portfolio-xray"

const stagger: Variants = { show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }
const rise: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 34 } },
}

const SLICE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-7)"]
const pct = (n: number) => `${n.toFixed(1)}%`
const tone = (n: number) => (n > 0 ? "var(--gain)" : n < 0 ? "var(--loss)" : "var(--fg2)")
const arrow = (n: number) => (n > 0 ? "▲" : n < 0 ? "▼" : "")

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.section variants={rise} className="pf-xr-sec">
      <h4 className="pf-xr-h">{title}</h4>
      {children}
    </motion.section>
  )
}

function Move({ label, amount, percent, note }: { label: string; amount?: number; percent: number | null; note?: string }) {
  const basis = percent ?? amount ?? 0
  return (
    <div className="pf-xr-stat">
      <span className="pf-xr-k">{label}</span>
      <span className="pf-xr-v" style={{ color: tone(basis) }}>
        {percent != null ? (
          <>
            <span aria-hidden>{arrow(percent)} </span>
            {formatPercent(percent)}
          </>
        ) : (
          "—"
        )}
      </span>
      {amount != null ? <span className="pf-xr-s">{formatCurrency(amount)}</span> : note ? <span className="pf-xr-s">{note}</span> : null}
    </div>
  )
}

const ICONS = { notable: AlertTriangle, watch: Eye, info: Info } as const

function InsightCard({ insight, onAsk }: { insight: Insight; onAsk: (q: string) => void }) {
  const Icon = ICONS[insight.severity]
  return (
    <motion.div variants={rise} className={`pf-xr-card sev-${insight.severity}`}>
      <Icon size={15} strokeWidth={1.75} className="pf-xr-ic" aria-hidden />
      <div className="pf-xr-cb">
        <div className="pf-xr-ct">{insight.title}</div>
        <p className="pf-xr-cs">{insight.summary}</p>
        {insight.metric ? <span className="pf-xr-chip">{insight.metric}</span> : null}
        <button type="button" className="pf-xr-ask" onClick={() => onAsk(insight.followUp)}>
          {insight.followUp}
          <ArrowUpRight size={12} aria-hidden />
        </button>
      </div>
    </motion.div>
  )
}

/**
 * The X-Ray as a report, not a wall of text. Every figure comes straight from
 * the server's result; nothing is derived here beyond formatting.
 */
export function XRayReport({ xray, onAsk }: { xray: XRay; onAsk: (question: string) => void }) {
  const { overview, allocation, concentration: c, performance: p } = xray
  const bars = [
    { k: "Largest holding", v: c.top1 },
    { k: "Top 3", v: c.top3 },
    { k: "Top 5", v: c.top5 },
  ]

  if (overview.holdingCount === 0) {
    return (
      <div className="pf-xr">
        <div className="pf-xr-top">
          <span className="pf-xr-label">Portfolio X-Ray</span>
        </div>
        <p className="pf-xr-cs" style={{ marginTop: 10 }}>
          There are no positions to analyze yet. Connect a brokerage or add positions to a manual account and run this again.
        </p>
      </div>
    )
  }

  return (
    <motion.div className="pf-xr" initial="hidden" animate="show" variants={stagger} aria-label="Portfolio X-Ray report" role="region">
      <motion.div variants={rise} className="pf-xr-top">
        <span className="pf-xr-label">Portfolio X-Ray</span>
        {xray.asOf ? <span className="pf-xr-asof">Prices as of {formatDate(xray.asOf)}</span> : null}
      </motion.div>

      <motion.div variants={rise} className="pf-xr-hero">
        <span className="pf-xr-fig">{formatCurrency(overview.totalValue)}</span>
        <span className="pf-xr-sub">
          In holdings · {overview.holdingCount} {overview.holdingCount === 1 ? "holding" : "holdings"}
          {overview.positionCount !== overview.holdingCount ? ` across ${overview.positionCount} positions` : ""}
        </span>
      </motion.div>

      <Section title="Performance">
        <div className="pf-xr-stats">
          <Move label="Today" percent={p.today?.percent ?? null} amount={p.today?.amount} note="Not enough price history" />
          <Move label={p.period ? `Past ${p.period.range === "1M" ? "month" : p.period.range}` : "Period"} percent={p.period?.percent ?? null} note="Needs more tracked history" />
          <Move label="Since purchase" percent={p.allTime?.percent ?? null} amount={p.allTime?.amount} note="No cost basis" />
        </div>
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
      </Section>

      <Section title="Allocation">
        <div className="pf-xr-stack" role="img" aria-label={allocation.map((a) => `${a.name} ${pct(a.percent)}`).join(", ")}>
          {allocation.map((a, i) => (
            <motion.span
              key={a.name}
              style={{ background: SLICE_COLORS[i % SLICE_COLORS.length], flexGrow: a.percent, transformOrigin: "left" }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 30, delay: 0.15 + i * 0.05 }}
              className="pf-xr-seg"
              title={`${a.name} ${pct(a.percent)}`}
            />
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
      </Section>

      <Section title="Concentration">
        <div className="pf-xr-bars">
          {bars.map((b, i) => (
            <div key={b.k} className="pf-xr-bar">
              <span>{b.k}</span>
              <div className="pf-xr-track">
                <motion.i initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ type: "spring", stiffness: 220, damping: 30, delay: 0.2 + i * 0.07 }} style={{ width: `${Math.min(100, b.v)}%`, transformOrigin: "left" }} />
              </div>
              <b>{pct(b.v)}</b>
            </div>
          ))}
        </div>
        <p className="pf-xr-note">
          Weighted like about <b>{c.effectiveHoldings.toFixed(1)}</b> equal-sized holdings. Individual stocks are {pct(c.singleStockWeight)} of the total.
        </p>
      </Section>

      <Section title="Largest positions">
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
      </Section>

      {xray.risks.length > 0 ? (
        <Section title="Worth a look">
          <div className="pf-xr-cards">
            {xray.risks.map((r) => (
              <InsightCard key={r.id} insight={r} onAsk={onAsk} />
            ))}
          </div>
        </Section>
      ) : (
        <Section title="Worth a look">
          <p className="pf-xr-cs">Nothing stands out against the checks Peerfolio runs: no single holding or small group dominates.</p>
        </Section>
      )}

      {xray.nextSteps.length > 0 ? (
        <Section title="Things to explore">
          <div className="pf-xr-cards">
            {xray.nextSteps.map((r) => (
              <InsightCard key={r.id} insight={r} onAsk={onAsk} />
            ))}
          </div>
        </Section>
      ) : null}

      <motion.details variants={rise} className="pf-xr-lim">
        <summary>What this can&apos;t see</summary>
        <ul>
          {xray.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p>Observations from your stored holdings, not investment advice.</p>
      </motion.details>
    </motion.div>
  )
}
