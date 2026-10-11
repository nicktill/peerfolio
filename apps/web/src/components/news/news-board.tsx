"use client"

import "@web/components/news/news.css"
import { useState } from "react"
import { SectionCard } from "@web/components/ui/section-card"
import { Segmented } from "@web/components/ui/segmented"
import { Reveal } from "@web/components/motion/reveal"
import { MarketStrip } from "@web/components/news/market-strip"
import { MarketRecap, type RecapView } from "@web/components/news/market-recap"
import { TopStories } from "@web/components/news/top-stories"
import { FearGreed } from "@web/components/news/fear-greed"
import { EarningsWeek } from "@web/components/news/earnings-week"
import { SectorBars } from "@web/components/news/sector-bars"
import { cn } from "@web/lib/utils"
import { EARNINGS_WEEK, FEAR_GREED, HOLDING_MOVES, INDEXES, RECAPS, SECTORS, type EarningsDay, type Period } from "@web/lib/news-sample"
import type { EarningsWeekData, FearGreedReading, MarketBoard } from "@web/lib/news-market"
import { CNN_FEAR_GREED_PAGE } from "@web/lib/news-market"
import { isUsMarketOpen } from "@web/lib/market-hours"
import { useApi } from "@web/lib/use-api"
import type { NewsResponse, PublishedBrief } from "@web/lib/news"

/** Your holdings' moves today, or "sample" for the preview's placeholder ones. */
export type HoldingMoves = { symbol: string; percent: number }[] | "sample" | null

type MarketResponse = { board: MarketBoard | null; earnings: EarningsWeekData | null; fearGreed: FearGreedReading | null }

/** How many companies a day shows under "All": the biggest, plus any you own. */
const EARNINGS_PER_DAY = 8

/** The week's days with your holdings marked, trimmed to the biggest reports plus yours. */
function markOwned(days: EarningsDay[], held: Set<string>): EarningsDay[] {
  return days.map((d) => ({
    ...d,
    reports: d.reports
      .map((r) => ({ ...r, owned: held.has(r.symbol) }))
      .filter((r, i) => i < EARNINGS_PER_DAY || r.owned),
  }))
}

const dayLabel = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...opts }).format(new Date(`${date}T16:00:00Z`))

function toView(brief: PublishedBrief): RecapView {
  const byId = new Map(brief.sources.map((s) => [s.id, s]))
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s))
  const day = dayLabel(brief.periodEnd, { weekday: "short", month: "short", day: "numeric" })
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(brief.createdAt))
  return {
    title: brief.period === "midday" ? "Midday update" : brief.period === "day" ? "Daily recap" : "Weekly recap",
    stamp:
      brief.period === "midday"
        ? `${day} · as of ${time} ET`
        : brief.period === "day"
          ? `${day} · after the close`
          : `Week ending ${dayLabel(brief.periodEnd, { month: "short", day: "numeric" })}`,
    headline: brief.headline,
    body: brief.body,
    takeaways: brief.takeaways.map((t) => ({ title: t.title, body: t.body, sources: pick(t.sourceIds) })),
    sources: brief.sources,
    kind: brief.fallback ? "fallback" : "ai",
  }
}

/**
 * Markets, the day's story, sentiment, the earnings week and sectors on one
 * page. One switch at the top (Today / This week) drives every card, so it
 * reads as a single briefing rather than a collection of widgets.
 */
export function NewsBoard({ holdingMoves, held = [] }: { holdingMoves: HoldingMoves; held?: string[] }) {
  const [period, setPeriod] = useState<Period>("day")
  const newsApi = useApi<NewsResponse>("/api/news")
  const news = newsApi.data
  // The preview shows the sample figures; the real page shows live data or, where a source is down, nothing.
  const sample = holdingMoves === "sample"
  // Each part loads on its own, so a slow source never holds up the others.
  const boardApi = useApi<Pick<MarketResponse, "board">>(sample ? null : "/api/news/market?part=board")
  const earningsApi = useApi<Pick<MarketResponse, "earnings">>(sample ? null : "/api/news/market?part=earnings")
  const fearGreedApi = useApi<Pick<MarketResponse, "fearGreed">>(sample ? null : "/api/news/market?part=fear-greed")
  const pending = (api: { data: unknown; error: string | null }) => !sample && !api.data && !api.error
  // Until the recap has answered, show its shape rather than a "lands after the close" note that the answer then replaces.
  const newsPending = pending(newsApi)
  const boardPending = pending(boardApi)
  const board = sample ? { indexes: INDEXES, sectors: SECTORS } : boardApi.data?.board ?? null
  const fearGreed = sample ? { ...FEAR_GREED, asOf: null as string | null } : fearGreedApi.data?.fearGreed ?? null
  const earningsData = earningsApi.data?.earnings
  const earnings = sample ? EARNINGS_WEEK : earningsData ? { label: earningsData.label, days: markOwned(earningsData.days, new Set(held)) } : null
  const brief = period === "day" ? news?.day : news?.week
  // The preview shows sample copy; the live page never does, since its made-up figures would contradict the real ones beside it.
  const recap: RecapView | null = brief ? toView(brief) : sample ? { ...RECAPS[period], kind: "sample" } : null
  const moves =
    holdingMoves === "sample"
      ? HOLDING_MOVES.map(([symbol, day, week]) => ({ symbol, percent: period === "day" ? day : week }))
      : period === "day"
        ? holdingMoves
        : null
  const now = new Date()
  const today = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(now).replace(", ", " · ")
  const open = isUsMarketOpen(now)
  const hasSectors = Boolean(board && board.sectors.length > 0)

  return (
    <div className="nw">
      <Reveal index={0} className="pf-phead">
        <div className="nw-head">
          <span className="pf-label">{period === "day" ? "The daily brief" : "The weekly brief"}</span>
          {/* The day's story is the page's headline. */}
          {newsPending ? (
            // Same height as the headline and its line below, so nothing moves when they arrive.
            <div aria-busy="true" aria-label="Loading the brief">
              <span className="pf-sk" style={{ display: "block", height: 38, width: "80%", maxWidth: 560, marginTop: 10 }} />
              <span className="pf-sk" style={{ display: "block", height: 16, width: "60%", maxWidth: 440, marginTop: 14 }} />
            </div>
          ) : (
            <>
              <h1 key={`${period}-${recap?.headline}`} className="swap-in">
                {recap?.headline ?? (period === "day" ? "Today in the markets" : "This week in the markets")}
              </h1>
              <p className="pf-lede">
                {!recap
                  ? `The ${period === "day" ? "daily" : "weekly"} recap is written after ${period === "day" ? "each close" : "the week’s last close"}. Here’s the market as it stands.`
                  : recap.kind === "ai"
                    ? `What moved, why it mattered, and what’s next, written from ${recap.sources?.length ?? 0} stories and checked against them.`
                    : recap.kind === "fallback"
                      ? "Today’s biggest stories, straight from the publishers."
                      : "Your two-minute read on the markets. The live brief lands after each close."}
              </p>
            </>
          )}
        </div>
        <Segmented<Period>
          label="Time period"
          options={[
            { value: "day", label: "Today" },
            { value: "week", label: "This week" },
          ]}
          value={period}
          onChange={setPeriod}
          className="shrink-0 self-start"
        />
      </Reveal>

      <Reveal index={1} className="nw-status">
        <span>
          <i className={cn("pf-dot", open ? "g live-dot" : "r")} aria-hidden />
          {/* Rendered on the server and again in the browser; a minute apart, these can differ. */}
          <span suppressHydrationWarning>{open ? "Markets open" : "Markets closed"}</span>
        </span>
        <span suppressHydrationWarning>{today}</span>
      </Reveal>

      {/* The section and its header are there from the first paint; only the cards inside arrive, so nothing is pushed down. */}
      {boardPending || (board && board.indexes.length > 0) ? (
        <section className="nw-markets" aria-labelledby="news-markets">
          <Reveal index={2} className="nw-markets-head">
            <h2 id="news-markets" className="pf-label">
              Markets at a glance
            </h2>
            <span>
              {sample ? (
                <span className="pf-chip nw-sample">Sample figures</span>
              ) : (
                <span className="nw-hide-sm" title="Index levels are licensed data; these are the funds that track each index, whose moves match to within a few hundredths of a percent.">
                  Tracked by index funds ·
                </span>
              )}
              <span className="nw-hide-xs">{period === "day" ? "Today’s session" : "Last 5 sessions"}</span>
            </span>
          </Reveal>
          {board && board.indexes.length > 0 ? (
            <MarketStrip quotes={board.indexes} period={period} startIndex={3} />
          ) : (
            <div className="nw-tiles" aria-busy="true" aria-label="Loading markets">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="nw-tile nw-tile-sk">
                  <span className="pf-sk" style={{ width: "55%", height: 14 }} />
                  <span className="pf-sk" style={{ width: "70%", height: 26, marginTop: 14 }} />
                  <span className="pf-sk" style={{ width: "100%", height: 44, marginTop: 22 }} />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <div className="nw-grid">
        {recap ? (
          <MarketRecap recap={recap} moves={moves} swapKey={`${period}-${recap.kind}`} index={5} />
        ) : newsPending ? (
          <PanelSkeleton label={period === "day" ? "Daily recap" : "Weekly recap"} rows={9} />
        ) : (
          <SectionCard label={period === "day" ? "Daily recap" : "Weekly recap"} index={5}>
            <div className="nw-empty">
              <b>{period === "day" ? "Today’s recap lands after the close" : "The weekly recap lands after the week’s last close"}</b>
              <p>Written from the day’s stories and checked against them. Until then, the numbers above are live.</p>
            </div>
          </SectionCard>
        )}
        {/* Each card keeps its slot while it loads, so the grid is the same shape before and after. */}
        {fearGreed ? (
          <FearGreed
            score={fearGreed.score}
            history={fearGreed.history}
            index={6}
            source={sample ? null : { label: "CNN", href: CNN_FEAR_GREED_PAGE, asOf: fearGreed.asOf }}
          />
        ) : pending(fearGreedApi) ? (
          <PanelSkeleton label="Fear & Greed" rows={6} />
        ) : null}
        {earnings ? (
          <EarningsWeek
            label={earnings.label}
            days={earnings.days}
            initialDay={Math.max(0, earnings.days.findIndex((d) => d.today))}
            index={7}
            // Full width only once the sectors are known to be missing.
            className={hasSectors || boardPending ? undefined : "nw-wide"}
          />
        ) : pending(earningsApi) ? (
          <PanelSkeleton label="Upcoming earnings" rows={6} />
        ) : null}
        {hasSectors ? <SectorBars sectors={board!.sectors} period={period} index={8} /> : boardPending ? <PanelSkeleton label="Sectors at a glance" rows={6} /> : null}
        {newsPending ? <PanelSkeleton label="Top stories" rows={6} wide /> : null}
        {news?.headlines.length ? <TopStories headlines={news.headlines.slice(0, 10)} index={9} /> : null}
      </div>
    </div>
  )
}

/** A panel-shaped placeholder while one source loads, so the rest of the page doesn't wait on it. */
function PanelSkeleton({ label, rows, wide = false }: { label: string; rows: number; wide?: boolean }) {
  return (
    <section className={cn("pf-panel nw-skel", wide && "nw-wide")} aria-busy="true" aria-label={`Loading ${label.toLowerCase()}`}>
      <div className="pf-ph">
        <span className="pf-label">{label}</span>
      </div>
      <div className="pf-pb" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} className="pf-sk" style={{ height: 14, width: `${96 - (i % 3) * 14}%` }} />
        ))}
      </div>
    </section>
  )
}
