"use client"

import "@web/components/news/news.css"
import { Fragment, useEffect, useState } from "react"
import { usePreviewDemo } from "@web/components/app-shell"
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

/** How long the page waits for every source before showing what it has. */
const LATE_MS = 4000

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
  const previewDemo = usePreviewDemo()
  const sample = holdingMoves === "sample" || previewDemo
  // Each part loads on its own, so a slow source never holds up the others.
  const boardApi = useApi<Pick<MarketResponse, "board">>(sample ? null : "/api/news/market?part=board")
  const earningsApi = useApi<Pick<MarketResponse, "earnings">>(sample ? null : "/api/news/market?part=earnings")
  const fearGreedApi = useApi<Pick<MarketResponse, "fearGreed">>(sample ? null : "/api/news/market?part=fear-greed")
  const pending = (api: { data: unknown; error: string | null }) => !sample && !api.data && !api.error
  // Whether a source has answered yet, in the preview too (it shows the live recap when there is one).
  const waiting = (api: { data: unknown; error: string | null }) => !api.data && !api.error
  const newsPending = waiting(newsApi)
  const boardPending = pending(boardApi)
  // Whether a section exists at all is only known once its source answers, and a section that turns out
  // to be missing would pull everything below it up. So the page is built once, when every source has
  // answered (or after a few seconds, so one slow source can't hold it back): until then a skeleton
  // of the same shape stands in, and it is swapped for the real thing in one step.
  const [late, setLate] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setLate(true), LATE_MS)
    return () => clearTimeout(timer)
  }, [])
  const ready = late || (!newsPending && !pending(boardApi) && !pending(earningsApi) && !pending(fearGreedApi) && (sample || holdingMoves !== null))
  // Only a page that showed the skeleton needs the crossfade out of it.
  const [hadSkeleton] = useState(!ready)
  const [veilGone, setVeilGone] = useState(false)
  useEffect(() => {
    if (!ready || !hadSkeleton) return
    const timer = setTimeout(() => setVeilGone(true), 520)
    return () => clearTimeout(timer)
  }, [ready, hadSkeleton])
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

  const stage = ready ? "ready" : "loading"

  return (
    <div className="nw">
      {previewDemo ? <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground" role="status">Design preview · Market prices, earnings and sentiment below are illustrative sample data.</p> : null}
      <Reveal index={0} className="pf-phead">
        <div className="nw-head">
          <span className="pf-label">{period === "day" ? "The daily brief" : "The weekly brief"}</span>
          {/* The head keeps its place; what sits in it is swapped in one step with the rest of the page, never resized in place. */}
          {!ready || newsPending ? (
            <div key="loading" className="nw-title" aria-busy="true" aria-label="Loading the brief">
              <span className="pf-sk nw-sk-h1" />
              <span className="pf-sk nw-sk-lede" />
              <span className="pf-sk nw-sk-lede nw-sk-lede-2" />
            </div>
          ) : (
            <div key="ready" className="nw-title">
              {/* The day's story is the page's headline. */}
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
            </div>
          )}
        </div>
        {ready ? (
          <Segmented<Period>
            key="ready"
            label="Time period"
            options={[
              { value: "day", label: "Today" },
              { value: "week", label: "This week" },
            ]}
            value={period}
            onChange={setPeriod}
            className="shrink-0 self-start"
          />
        ) : (
          <span key="loading" className="pf-sk nw-sk-seg shrink-0 self-start" aria-hidden />
        )}
      </Reveal>

      <Fragment key={stage}>
        {ready ? (
          <>
            <Reveal index={1} className="nw-status">
              <span>
                <i className={cn("pf-dot", open ? "g live-dot" : "r")} aria-hidden />
                {/* Rendered on the server and again in the browser; a minute apart, these can differ. */}
                <span suppressHydrationWarning>{open ? "Markets open" : "Markets closed"}</span>
              </span>
              <span suppressHydrationWarning>{today}</span>
            </Reveal>

            <div className="nw-body">
              {/* A section is only here once its source has said it has something, so nothing is ever pulled up from under it. */}
              {board && board.indexes.length > 0 ? (
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
                  <MarketStrip quotes={board.indexes} period={period} startIndex={3} />
                </section>
              ) : boardPending ? (
                <MarketsSkeleton />
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

              {/* The skeleton fades out over the content arriving beneath it, then goes. */}
              {hadSkeleton && !veilGone ? (
                <div className="nw-veil" aria-hidden>
                  <NewsSkeleton />
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="nw-status nw-status-sk" aria-hidden>
              <span className="pf-sk" />
            </div>
            <NewsSkeleton />
          </>
        )}
      </Fragment>
    </div>
  )
}

/** The page's shape before anything has arrived: every section at about the height it ends up. */
function NewsSkeleton() {
  return (
    <div className="nw-body nw-skeleton" aria-busy="true" aria-label="Loading the news">
      <MarketsSkeleton />
      <div className="nw-grid">
        <PanelSkeleton label="Daily recap" rows={9} tall />
        <PanelSkeleton label="Fear & Greed" rows={6} tall />
        <PanelSkeleton label="Upcoming earnings" rows={6} tall />
        <PanelSkeleton label="Sectors at a glance" rows={6} tall />
        <PanelSkeleton label="Top stories" rows={6} wide tall />
      </div>
    </div>
  )
}

/** The market tiles' place while the board loads, at the tiles' final size. */
function MarketsSkeleton() {
  return (
    <section className="nw-markets" aria-label="Loading markets">
      <div className="nw-markets-head">
        <span className="pf-label">Markets at a glance</span>
      </div>
      <div className="nw-tiles">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="nw-tile nw-tile-sk">
            <span className="pf-sk" style={{ width: "55%", height: 16 }} />
            <span className="pf-sk" style={{ width: "70%", height: 32, marginTop: 12 }} />
            <span className="pf-sk" style={{ width: "100%", height: 48, marginTop: "auto" }} />
          </div>
        ))}
      </div>
    </section>
  )
}

/** A panel-shaped placeholder while one source loads, so the rest of the page doesn't wait on it. */
function PanelSkeleton({ label, rows, wide = false, tall = false }: { label: string; rows: number; wide?: boolean; tall?: boolean }) {
  return (
    <section className={cn("pf-panel nw-skel", wide && "nw-wide", tall && "nw-skel-tall")} aria-busy="true" aria-label={`Loading ${label.toLowerCase()}`}>
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
