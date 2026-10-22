"use client"

import { useState } from "react"
import Link from "next/link"
import { useApi } from "@web/lib/use-api"
import { briefingSlot, BRIEFING_TITLES } from "@web/lib/news-brief"
import type { NewsResponse } from "@web/lib/news"
import type { MarketBoard, EarningsWeekData } from "@web/lib/news-market"
import { CalendarDays, Gamepad2, LayoutDashboard, Medal, Newspaper, Trophy } from "lucide-react"
import { LeaguePreview } from "@web/components/landing/league-preview"
import { PortfolioView } from "@web/components/landing/product-tour"
import { PlayPreview } from "@web/components/landing/play-preview"
import { CastAvatar } from "@web/components/landing/cast-avatar"
import { CAST } from "@web/components/landing/demo"
import { ScrollTilt } from "@web/components/landing/scroll-tilt"
import { TiltCard } from "@web/components/ui/tilt-card"
import { Sparkline } from "@web/components/ui/sparkline"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import { MarketStrip } from "@web/components/news/market-strip"
import "@web/components/news/news.css"

const PAGES = [
  { label: "Portfolio", Icon: LayoutDashboard },
  { label: "Leagues", Icon: Trophy },
  { label: "Fantasy", Icon: Gamepad2 },
  { label: "Board", Icon: Medal },
  { label: "News", Icon: Newspaper },
] as const

type Page = (typeof PAGES)[number]["label"]

export function HeroProductPreview() {
  const [page, setPage] = useState<Page>("Leagues")
  return (
    <ScrollTilt>
      <TiltCard max={0.6} glare={false} className="pf-window">
        <div className="pf-window-bar" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="pf-logo !size-5" />
          <span className="pf-wordmark !text-[17px]">Peerfolio</span>
          <span className="pf-sample ml-auto">{page === "News" ? "Public market news" : "Interactive preview · sample data"}</span>
        </div>
        <div className="pf-demo-layout">
          <div className="pf-preview-nav" role="tablist" aria-label="Explore Peerfolio pages">
            {PAGES.map(({ label, Icon }, i) => (
              <button key={label} id={`preview-tab-${label}`} type="button" role="tab"
                aria-selected={page === label} aria-controls="hero-preview-page"
                tabIndex={page === label ? 0 : -1}
                onClick={() => setPage(label)}
                onKeyDown={(event) => {
                  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0
                  const next = event.key === "Home" ? 0 : event.key === "End" ? PAGES.length - 1 : step ? (i + step + PAGES.length) % PAGES.length : null
                  if (next === null) return
                  event.preventDefault()
                  setPage(PAGES[next]!.label)
                  document.getElementById(`preview-tab-${PAGES[next]!.label}`)?.focus()
                }}>
                <Icon className="size-4" strokeWidth={1.7} aria-hidden />{label}
              </button>
            ))}
          </div>
          <div id="hero-preview-page" role="tabpanel" aria-labelledby={`preview-tab-${page}`} tabIndex={0} className="pf-demo-page">
            {page === "Leagues" ? <LeaguePreview tilt={0} /> : page === "Portfolio" ? <PortfolioView e={1} scrub={false} compact tilt={0} /> : page === "Fantasy" ? <PlayPreview /> : page === "Board" ? <BoardPreview /> : null}
            <div hidden={page !== "News"} className={page === "News" ? "swap-in" : undefined}><NewsPreview /></div>
          </div>
        </div>
      </TiltCard>
    </ScrollTilt>
  )
}

function BoardPreview() {
  const members = [...CAST].sort((a,b) => b.points[b.points.length-1]! - a.points[a.points.length-1]!)
  return (
    <section className="pf-panel pf-lift">
      <div className="pf-ph"><h3 className="pf-label">The board</h3><span className="pf-sample">Sample · 30-day return</span></div>
      <ol className="divide-y px-4 sm:px-5">
        {members.map((member,i) => (
          <li key={member.id} className="flex items-center gap-3 py-3.5">
            <span className="numeric w-5 text-center text-[var(--fg3)]">{i+1}</span>
            <CastAvatar member={member} size={36} />
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">{member.name}</p><p className="truncate text-xs text-[var(--fg3)]">{member.note}</p></div>
            <span className="hidden shrink-0 sm:block"><Sparkline points={member.points} width={96} height={28} /></span>
            <span className="shrink-0 sm:hidden"><Sparkline points={member.points} width={44} height={24} /></span>
            <span className="numeric shrink-0 text-sm" style={{color:member.points[member.points.length-1]! >= 100 ? "var(--gain)" : "var(--loss)"}}>{member.points[member.points.length-1]! >= 100 ? "+" : ""}{(member.points[member.points.length-1]!-100).toFixed(2)}%</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function NewsPreview() {
  const news = useApi<NewsResponse>("/api/news", [], { refreshMs: 60_000 })
  const market = useApi<{ board: MarketBoard | null }>("/api/news/market?part=board", [], { refreshMs: 5 * 60_000 })
  const earnings = useApi<{ earnings: EarningsWeekData | null }>("/api/news/market?part=earnings", [], { refreshMs: 60 * 60_000 })
  const brief = news.data?.day
  const briefingTitle = brief?.period === "midday" ? BRIEFING_TITLES[briefingSlot(new Date(brief.createdAt))?.phase ?? "midday"] : "Daily recap"
  const stamp = brief ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(brief.createdAt)) + " ET" : "Latest briefing"
  const board = market.data?.board
  return (
    <div className="nw space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-3">
        <div><h3 className="pf-h3">Markets at a glance</h3><p className="pf-sample mt-2">{board ? `Market data · session ${board.session}` : "Public market news"}</p></div>
        <Link href="/market-news" className="pf-btn">Read the news →</Link>
      </div>
      {board?.indexes.length ? <MarketStrip quotes={board.indexes} period="day" startIndex={0} /> : <NewsState pending={market.loading} message="Market quotes are temporarily unavailable." />}
      <div className="pf-preview-news-bottom">
        <section className="pf-panel pf-lift">
          <div className="pf-ph"><h3 className="pf-label">{briefingTitle}</h3><span className="pf-sample">{stamp}</span></div>
          <div className="pf-pb">
            {brief ? <><h4 className="pf-h3 line-clamp-2">{brief.headline}</h4><p className="pf-sub mt-4 max-w-[70ch] line-clamp-6 text-sm leading-6">{brief.body}</p></> : <p className="pf-sub text-sm" role="status">{news.loading ? "Loading the latest briefing…" : "The latest briefing is not available yet."}</p>}
          </div>
        </section>
        {earnings.data?.earnings?.days.length ? <EarningsPreview key={earnings.data.earnings.asOf} week={earnings.data.earnings} /> : <NewsState pending={earnings.loading} message="The earnings calendar is temporarily unavailable." />}
      </div>
    </div>
  )
}

function NewsState({ pending, message }: { pending: boolean; message: string }) {
  return <div className="pf-panel pf-pb flex min-h-[180px] items-center" role="status"><p className="pf-sub text-sm">{pending ? "Loading market news…" : message}</p></div>
}

function EarningsPreview({ week }: { week: EarningsWeekData }) {
  const [selected, setSelected] = useState(Math.max(0, week.days.findIndex((day) => day.today)))
  const day = week.days[selected]!
  return (
    <section className="pf-panel pf-lift" aria-labelledby="preview-earnings-title">
      <div className="pf-ph"><h3 id="preview-earnings-title" className="pf-label">Earnings calendar</h3><CalendarDays className="size-4 text-[var(--fg3)]" aria-hidden /></div>
      <div className="pf-pb !pb-3">
        <p className="pf-sample mb-3">{week.label}</p>
        <div className="grid grid-cols-5 gap-1" role="group" aria-label="Earnings days">
          {week.days.map((d,i) => (
            <button key={d.date} type="button" aria-pressed={i === selected} aria-label={d.label} onClick={() => setSelected(i)} className="pf-preview-earnings-day">
              <span>{d.dow}</span><b className="numeric">{d.date}</b>
            </button>
          ))}
        </div>
      </div>
      <ul className="pf-preview-earnings-list divide-y px-4 sm:px-[18px]" tabIndex={0} aria-label={`${day.label}, ${day.reports.length} reports`}>
        {day.reports.map((report) => (
          <li key={report.symbol} className="flex items-center gap-2 py-3">
            <TickerLogo symbol={report.symbol} size="xs" />
            <div className="min-w-0 flex-1"><p className="text-xs font-medium">{report.symbol}</p><p className="truncate text-[11px] text-[var(--fg3)]">{report.name}</p></div>
            <span className="text-[11px] text-[var(--fg2)]">{report.when === "before-open" ? "Before open" : report.when === "after-close" ? "After close" : "During trading"}</span>
          </li>
        ))}
        {day.reports.length === 0 ? <li className="py-5 text-xs text-[var(--fg3)]">No reports scheduled for this day.</li> : null}
      </ul>
    </section>
  )
}
