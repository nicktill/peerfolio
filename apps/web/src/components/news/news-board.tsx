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
import { IconChip, SectionLabel } from "@web/components/ui/section-card"
import { Activity } from "lucide-react"
import { cn } from "@web/lib/utils"
import { EARNINGS_WEEK, FEAR_GREED, HOLDING_MOVES, INDEXES, RECAPS, SECTORS, type Period } from "@web/lib/news-sample"
import { isUsMarketOpen } from "@web/lib/market-hours"
import { useApi } from "@web/lib/use-api"
import type { NewsResponse, PublishedBrief } from "@web/lib/news"

/** Your holdings' moves today, or "sample" for the preview's placeholder ones. */
export type HoldingMoves = { symbol: string; percent: number }[] | "sample" | null

const dayLabel = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...opts }).format(new Date(`${date}T16:00:00Z`))

function toView(brief: PublishedBrief): RecapView {
  const byId = new Map(brief.sources.map((s) => [s.id, s]))
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s))
  return {
    title: brief.period === "day" ? "Daily recap" : "Weekly recap",
    stamp: brief.period === "day" ? `${dayLabel(brief.periodEnd, { weekday: "short", month: "short", day: "numeric" })} · after the close` : `Week ending ${dayLabel(brief.periodEnd, { month: "short", day: "numeric" })}`,
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
export function NewsBoard({ holdingMoves }: { holdingMoves: HoldingMoves }) {
  const [period, setPeriod] = useState<Period>("day")
  const { data: news } = useApi<NewsResponse>("/api/news")
  const brief = period === "day" ? news?.day : news?.week
  const recap: RecapView = brief ? toView(brief) : { ...RECAPS[period], kind: "sample" }
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
  const up = INDEXES[0]![period].percent >= 0

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
              <h1 key={`${period}-${recap.headline}`} className="swap-in mt-2 text-balance font-display text-3xl font-semibold leading-[1.1] tracking-tight sm:text-[40px]">
                {recap.headline}
              </h1>
              <p className="mt-3 max-w-xl text-sm text-muted-foreground">
                {recap.kind === "ai"
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

      <section className="flex flex-col gap-2.5" aria-labelledby="news-markets">
        <Reveal index={1} className="flex items-center justify-between gap-2 px-0.5">
          <span className="flex items-center gap-2.5">
            <IconChip tone="primary">
              <Activity />
            </IconChip>
            <SectionLabel id="news-markets">Markets at a glance</SectionLabel>
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="whitespace-nowrap border-dashed" title="Index, sector, sentiment and earnings figures are placeholders until a market-data licence is in place. The brief and stories are live.">
              Sample figures
            </Badge>
            <span className="hidden sm:inline">{period === "day" ? "Today’s session" : "Last 5 sessions"}</span>
          </span>
        </Reveal>
        <MarketStrip quotes={INDEXES} period={period} startIndex={1} />
      </section>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <MarketRecap recap={recap} moves={moves} swapKey={`${period}-${recap.kind}`} index={5} showHeadline={false} />
        <FearGreed score={FEAR_GREED.score} history={FEAR_GREED.history} index={6} />
        <EarningsWeek label={EARNINGS_WEEK.label} days={EARNINGS_WEEK.days} initialDay={3} index={7} />
        <SectorBars sectors={SECTORS} period={period} index={8} />
        {news?.headlines.length ? <TopStories headlines={news.headlines.slice(0, 10)} index={9} /> : null}
      </div>
    </div>
  )
}
