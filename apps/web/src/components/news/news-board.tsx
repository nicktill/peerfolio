"use client"

import { useState } from "react"
import { Segmented } from "@web/components/ui/segmented"
import { Badge } from "@web/components/ui/badge"
import { Reveal } from "@web/components/motion/reveal"
import { MarketStrip } from "@web/components/news/market-strip"
import { MarketRecap } from "@web/components/news/market-recap"
import { FearGreed } from "@web/components/news/fear-greed"
import { EarningsWeek } from "@web/components/news/earnings-week"
import { SectorBars } from "@web/components/news/sector-bars"
import { SectionLabel } from "@web/components/ui/section-card"
import { EARNINGS_WEEK, FEAR_GREED, HOLDING_MOVES, INDEXES, RECAPS, SECTORS, type Period } from "@web/lib/news-sample"

/**
 * Markets, the day's story, sentiment, the earnings week and sectors on one
 * page. One switch at the top (Today / This week) drives every card, so it
 * reads as a single briefing rather than a collection of widgets.
 */
export function NewsBoard() {
  const [period, setPeriod] = useState<Period>("day")

  return (
    <div className="flex flex-col gap-5 pb-16 pt-2">
      <Reveal index={0} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <SectionLabel>Tuesday · October 6</SectionLabel>
          <h1 className="font-display text-[34px] font-semibold leading-none tracking-tight">News</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-[7px] rounded-full bg-muted-foreground" aria-hidden />
              Markets closed
            </span>
            <span aria-hidden>·</span>
            <span>Prices as of 4:00 PM ET</span>
            <Badge variant="outline" className="border-dashed">
              Sample data
            </Badge>
          </div>
        </div>
        <Segmented<Period>
          label="Time period"
          options={[
            { value: "day", label: "Today" },
            { value: "week", label: "This week" },
          ]}
          value={period}
          onChange={setPeriod}
        />
      </Reveal>

      <section className="flex flex-col gap-2.5" aria-labelledby="news-markets">
        <Reveal index={1} className="flex items-center justify-between gap-2 px-0.5">
          <SectionLabel id="news-markets">Markets at a glance</SectionLabel>
          <span className="text-xs text-muted-foreground">{period === "day" ? "Today’s session" : "Last 5 sessions"}</span>
        </Reveal>
        <MarketStrip quotes={INDEXES} period={period} startIndex={1} />
      </section>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <MarketRecap recap={RECAPS[period]} moves={HOLDING_MOVES} period={period} index={5} />
        <FearGreed score={FEAR_GREED.score} history={FEAR_GREED.history} index={6} />
        <EarningsWeek label={EARNINGS_WEEK.label} days={EARNINGS_WEEK.days} initialDay={3} index={7} />
        <SectorBars sectors={SECTORS} period={period} index={8} />
      </div>
    </div>
  )
}
