"use client"

import { useState } from "react"
import { Segmented } from "@web/components/ui/segmented"
import { Badge } from "@web/components/ui/badge"
import { Reveal } from "@web/components/motion/reveal"
import { MarketStrip } from "@web/components/news/market-strip"
import { MarketRecap, type RecapView } from "@web/components/news/market-recap"
import { TopStories } from "@web/components/news/top-stories"
import { FearGreed } from "@web/components/news/fear-greed"
import { EarningsWeek } from "@web/components/news/earnings-week"
import { SectorBars } from "@web/components/news/sector-bars"
import { IconChip, SectionCard, SectionLabel } from "@web/components/ui/section-card"
import { Activity, Sparkles } from "lucide-react"
import { Skeleton } from "@web/components/ui/skeleton"
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
  const { data: news } = useApi<NewsResponse>("/api/news")
  // The preview shows the sample figures; the real page shows live data or, where a source is down, nothing.
  const sample = holdingMoves === "sample"
  // Each part loads on its own, so a slow source never holds up the others.
  const boardApi = useApi<Pick<MarketResponse, "board">>(sample ? null : "/api/news/market?part=board")
  const earningsApi = useApi<Pick<MarketResponse, "earnings">>(sample ? null : "/api/news/market?part=earnings")
  const fearGreedApi = useApi<Pick<MarketResponse, "fearGreed">>(sample ? null : "/api/news/market?part=fear-greed")
  const pending = (api: { data: unknown; error: string | null }) => !sample && !api.data && !api.error
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
  // The hero takes the colour of the broad market's move.
  const hasSectors = Boolean(board && board.sectors.length > 0)
  const up = (board?.indexes[0]?.[period]?.percent ?? board?.indexes[0]?.day.percent ?? 0) >= 0

  return (
    <div className="flex flex-col gap-5 pb-16 pt-2">
      <Reveal index={0}>
        <header className="relative overflow-hidden rounded-3xl border bg-card p-6 sm:p-8">
          <div className="hero-grid absolute inset-0 opacity-70" aria-hidden />
          <div
            aria-hidden
            className="absolute -right-20 -top-24 size-80 rounded-full blur-3xl transition-colors duration-700"
            style={{ backgroundColor: `color-mix(in srgb, var(${up ? "--gain" : "--loss"}) 22%, transparent)` }}
          />
          <span aria-hidden className="absolute -bottom-8 right-4 select-none text-[7rem] leading-none opacity-20 sm:text-[9rem]">
            {up ? "📈" : "📉"}
          </span>
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                  <span className={cn("size-1.5 rounded-full bg-primary-foreground", open && "live-dot")} aria-hidden />
                  {/* Rendered on the server and again in the browser; a minute apart, these can differ. */}
                  <span suppressHydrationWarning>{open ? "Markets open" : "Markets closed"}</span>
                </span>
                <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                  {today}
                </span>
              </div>
              <SectionLabel as="span" className="mt-4 block">
                {period === "day" ? "The daily brief" : "The weekly brief"}
              </SectionLabel>
              {/* The day's story is the page's headline. */}
              <h1 key={`${period}-${recap?.headline}`} className="swap-in mt-2 text-balance font-display text-3xl font-semibold leading-[1.1] tracking-tight sm:text-[40px]">
                {recap?.headline ?? (period === "day" ? "Today in the markets" : "This week in the markets")}
              </h1>
              <p className="mt-3 max-w-xl text-sm text-muted-foreground">
                {!recap
                  ? `The ${period === "day" ? "daily" : "weekly"} recap is written after ${period === "day" ? "each close" : "the week’s last close"}. Here’s the market as it stands.`
                  : recap.kind === "ai"
                  ? `What moved, why it mattered, and what’s next, written from ${recap.sources?.length ?? 0} stories and checked against them.`
                  : recap.kind === "fallback"
                    ? "Today’s biggest stories, straight from the publishers."
                    : "Your two-minute read on the markets. The live brief lands after each close."}
              </p>
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
          </div>
        </header>
      </Reveal>

      {pending(boardApi) ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading markets">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[148px] rounded-2xl" />
          ))}
        </div>
      ) : null}
      {board && board.indexes.length > 0 ? (
        <section className="flex flex-col gap-2.5" aria-labelledby="news-markets">
          <Reveal index={1} className="flex items-center justify-between gap-2 px-0.5">
            <span className="flex items-center gap-2.5">
              <IconChip tone="primary">
                <Activity />
              </IconChip>
              <SectionLabel id="news-markets">Markets at a glance</SectionLabel>
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {sample ? (
                <Badge variant="outline" className="whitespace-nowrap border-dashed">
                  Sample figures
                </Badge>
              ) : (
                <span className="hidden md:inline" title="Index levels are licensed data; these are the funds that track each index, whose moves match to within a few hundredths of a percent.">
                  Tracked by index funds ·
                </span>
              )}
              <span className="hidden sm:inline">{period === "day" ? "Today’s session" : "Last 5 sessions"}</span>
            </span>
          </Reveal>
          <MarketStrip quotes={board.indexes} period={period} startIndex={1} />
        </section>
      ) : null}

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        {recap ? (
          <MarketRecap recap={recap} moves={moves} swapKey={`${period}-${recap.kind}`} index={5} showHeadline={false} />
        ) : (
          <SectionCard label={period === "day" ? "Daily recap" : "Weekly recap"} icon={<Sparkles />} tone="primary" index={5}>
            <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
              <span className="text-sm font-semibold">{period === "day" ? "Today’s recap lands after the close" : "The weekly recap lands after the week’s last close"}</span>
              <span className="max-w-sm text-[13px] text-muted-foreground">
                Written from the day’s stories and checked against them. Until then, the numbers above are live.
              </span>
            </div>
          </SectionCard>
        )}
        {pending(fearGreedApi) ? <Skeleton className="min-h-[420px] rounded-2xl" /> : null}
        {fearGreed ? (
          <FearGreed
            score={fearGreed.score}
            history={fearGreed.history}
            index={6}
            source={sample ? null : { label: "CNN", href: CNN_FEAR_GREED_PAGE, asOf: fearGreed.asOf }}
          />
        ) : null}
        {pending(earningsApi) ? <Skeleton className="min-h-[420px] rounded-2xl" /> : null}
        {pending(boardApi) ? <Skeleton className="min-h-[420px] rounded-2xl" /> : null}
        {earnings ? (
          <EarningsWeek
            label={earnings.label}
            days={earnings.days}
            initialDay={Math.max(0, earnings.days.findIndex((d) => d.today))}
            index={7}
            // Full width when there's no sector card beside it.
            className={hasSectors ? undefined : "lg:col-span-2"}
          />
        ) : null}
        {hasSectors ? <SectorBars sectors={board!.sectors} period={period} index={8} /> : null}
        {news?.headlines.length ? <TopStories headlines={news.headlines.slice(0, 10)} index={9} /> : null}
      </div>
    </div>
  )
}
