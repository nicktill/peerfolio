"use client"

import { useState } from "react"
import { ArrowDownUp, Check } from "lucide-react"
import { PerformanceChart, type PerformancePoint } from "@web/components/charts/performance-chart"
import { TiltCard } from "@web/components/ui/tilt-card"
import { CastAvatar } from "@web/components/landing/cast-avatar"
import { Delta } from "@web/components/ui/delta"
import { CAST } from "@web/components/landing/demo"
import { cn } from "@web/lib/utils"

type TabId = "portfolio" | "leagues" | "fantasy"

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

/** Three product views behind one switch, each a static miniature of the real screen. */
export function ProductTour() {
  const [tab, setTab] = useState<TabId>("portfolio")

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
      <div>
        <div role="tablist" aria-label="Product tour" className="flex flex-col">
          {TABS.map((t, i) => {
            const active = t.id === tab
            return (
              <button
                key={t.id}
                role="tab"
                id={`tour-tab-${t.id}`}
                aria-selected={active}
                aria-controls="tour-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => {
                  const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0
                  if (!step) return
                  e.preventDefault()
                  const next = TABS[(i + step + TABS.length) % TABS.length]!
                  setTab(next.id)
                  document.getElementById(`tour-tab-${next.id}`)?.focus()
                }}
                className="pf-tab min-h-[44px] text-left"
                data-active={active || undefined}
              >
                <span className="pf-step-num">0{i + 1}</span>
                <span className="pf-tab-title">{t.label}</span>
              </button>
            )
          })}
        </div>
        {TABS.filter((t) => t.id === tab).map((t) => (
          <div key={t.id} className="swap-in mt-7">
            <h3 className="pf-h3">{t.title}</h3>
            <p className="pf-sub mt-2 text-[15px] leading-6">{t.body}</p>
            <ul className="mt-4 space-y-2">
              {t.points.map((p) => (
                <li key={p} className="pf-sub flex items-start gap-2.5 text-sm leading-6">
                  <Check className="mt-1 size-3.5 shrink-0 text-[var(--pf-accent)]" aria-hidden strokeWidth={2} />
                  {p}
                </li>
              ))}
            </ul>
            {t.note ? <p className="pf-soon mt-5">{t.note}</p> : null}
          </div>
        ))}
      </div>

      <div id="tour-panel" role="tabpanel" aria-labelledby={`tour-tab-${tab}`} className="min-w-0">
        <div key={tab} className="swap-in">
          {tab === "portfolio" ? <PortfolioView /> : tab === "leagues" ? <LeaguesView /> : <FantasyView />}
        </div>
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

function PortfolioView() {
  const last = NET_WORTH[NET_WORTH.length - 1]!.value
  return (
    <TiltCard max={4} className="pf-panel pf-lift" >
      <div className="pf-ph">
        <h3 className="pf-label">Net worth</h3>
        <span className="pf-ph-end text-xs text-[var(--fg3)]">Last 90 days</span>
      </div>
      <div className="pf-pb">
        <p className="numeric font-display text-[40px] leading-[46px] sm:text-[52px] sm:leading-[58px]" style={{ letterSpacing: "-0.035em" }}>
          ${last.toLocaleString("en-US")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Delta value={12.4} variant="plain" />
          <span className="text-xs text-[var(--fg3)]">return, leaves out money you add</span>
        </div>
        <div className="-mx-1 mt-3">
          <PerformanceChart points={NET_WORTH} height={170} ariaLabel="Net worth over the last 90 days" showTooltip={false} />
        </div>
      </div>
      <ul className="divide-y border-t px-4 sm:px-[18px]" style={{ borderColor: "var(--hair)" }}>
        {ACCOUNTS.map((a) => (
          <li key={a.name} className="flex items-center gap-3 py-3">
            <Monogram name={a.inst} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{a.name}</p>
              <p className="truncate text-xs text-[var(--fg3)]">
                {a.inst} · added by hand
              </p>
            </div>
            <span className="numeric text-sm font-medium">{a.amount}</span>
          </li>
        ))}
      </ul>
    </TiltCard>
  )
}

/* ---------- Real leagues ---------- */

function LeaguesView() {
  return (
    <TiltCard max={4} className="pf-panel pf-lift">
      <div className="pf-ph">
        <h3 className="pf-label">
          Standings<em>Ranked by return</em>
        </h3>
        <span className="pf-ph-end pf-sample">Sample league</span>
      </div>
      <ul className="divide-y px-4 pb-1 sm:px-[18px]">
        {CAST.slice(0, 4).map((m, i) => (
          <li key={m.id} className="py-3.5">
            <div className="flex items-center gap-3">
              <span className="numeric w-5 shrink-0 text-center font-mono text-sm font-medium" style={{ color: i < 3 ? ["var(--rank-1)", "var(--rank-2)", "var(--rank-3)"][i] : "var(--fg3)" }}>{i + 1}</span>
              <span className="rounded-full p-[2px]" style={{ boxShadow: `0 0 0 1.5px ${m.color}` }}><CastAvatar member={m} size={30} /></span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}{m.isYou ? <span className="ml-1.5 rounded bg-foreground px-1 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-background">you</span> : null}</span>
              <Delta value={m.percent} variant="plain" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[84px]">
              {m.holdings.map((h) => (
                <span key={h.ticker} className="numeric inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-2.5 pr-2.5 text-[11px] font-medium" style={{ borderColor: "var(--hair)", backgroundImage: `linear-gradient(90deg, rgba(var(--accent-a), 0.16) ${h.weight}%, transparent ${h.weight}%)` }}>
                  <span className="font-mono font-semibold">{h.ticker}</span>
                  <span className="text-[var(--fg3)]">{h.weight}%</span>
                </span>
              ))}
              <span className="ml-auto flex gap-1">
                {m.reactions.map((r) => (
                  <span key={r.emoji} className="numeric inline-flex items-center gap-0.5 rounded-full bg-[var(--raise)] px-1.5 py-0.5 text-[11px]">
                    <span aria-hidden>{r.emoji}</span>
                    {r.count}
                  </span>
                ))}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </TiltCard>
  )
}

/* ---------- Fantasy ---------- */

const FEED = [
  { who: "Theo", what: "bought 12 NVDA", when: "2h" },
  { who: "Dev", what: "sold 40 SOFI", when: "5h" },
  { who: "Priya", what: "bought 8 VTI", when: "1d" },
]

function FantasyView() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-label="Fantasy league preview">
      <TiltCard max={4.5} className="pf-panel pf-lift">
        <div className="pf-ph">
          <h3 className="pf-label">Make a move</h3>
          <span className="pf-ph-end pf-sample">Play money</span>
        </div>
        <div className="pf-pb space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg border p-1 text-center text-sm font-medium" style={{ borderColor: "var(--hair)" }}>
            <span className="rounded-md bg-[var(--raise)] py-1.5">Buy</span>
            <span className="py-1.5 text-[var(--fg3)]">Sell</span>
          </div>
          <Field label="Stock" value="NVDA" aside="$142.10" />
          <Field label="Shares" value="10" aside="$1,421.00" />
          <p className="flex items-center justify-between text-xs text-[var(--fg3)]">
            <span>Cash after</span>
            <span className="numeric">$98,579</span>
          </p>
          <span className="flex h-10 items-center justify-center gap-2 rounded-[var(--r-s)] bg-primary text-sm font-medium text-primary-foreground">
            <ArrowDownUp className="size-4" aria-hidden />
            Buy NVDA
          </span>
        </div>
      </TiltCard>

      <TiltCard max={4.5} className="pf-panel pf-lift">
        <div className="pf-ph">
          <h3 className="pf-label">Standings</h3>
        </div>
        <ul className="divide-y px-4 sm:px-[18px]">
          {[CAST[0]!, CAST[2]!, CAST[4]!].map((m, i) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <span className="numeric w-5 text-center font-mono text-sm font-medium text-[var(--fg2)]">{i + 1}</span>
              <CastAvatar member={m} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
              <Delta value={[5.4, 2.1, -1.8][i]!} variant="plain" />
            </li>
          ))}
        </ul>
        <div className="border-t px-4 py-3 sm:px-[18px]" style={{ borderColor: "var(--hair)" }}>
          <p className="pf-label-plain">Trade feed</p>
          <ul className="mt-2 space-y-1.5">
            {FEED.map((f) => (
              <li key={f.what} className="flex justify-between gap-3 text-[13px] leading-5">
                <span className="truncate"><b className="font-medium">{f.who}</b> <span className="text-[var(--fg2)]">{f.what}</span></span>
                <span className="text-[var(--fg3)]">{f.when}</span>
              </li>
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
      <div className={cn("flex h-10 items-center justify-between rounded-[var(--r-s)] border px-3 text-sm")} style={{ borderColor: "var(--line)" }}>
        <span className="font-medium">{value}</span>
        <span className="numeric text-xs text-[var(--fg3)]">{aside}</span>
      </div>
    </div>
  )
}
