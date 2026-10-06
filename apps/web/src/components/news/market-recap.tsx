import Link from "next/link"
import { Sparkles } from "lucide-react"
import { Delta } from "@web/components/ui/delta"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import { SectionCard } from "@web/components/news/section-card"
import type { Period, Recap } from "@web/lib/news-sample"

/** Headline, a short read, three takeaways, then how the day touched your holdings. */
export function MarketRecap({ recap, moves, period, index }: { recap: Recap; moves: [string, number, number][]; period: Period; index: number }) {
  return (
    <SectionCard
      label={recap.title}
      href="#"
      index={index}
      action={
        <span className="inline-flex items-center gap-1.5 pr-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {recap.stamp}
        </span>
      }
    >
      {/* Keyed on the period: the story swaps with a soft crossfade instead of snapping. */}
      <div key={period} className="swap-in flex flex-1 flex-col gap-3.5 p-5">
        <h3 className="text-balance font-display text-[27px] font-semibold leading-[1.15] tracking-tight">{recap.headline}</h3>
        <p className="max-w-[64ch] text-[15px] leading-relaxed text-muted-foreground">{recap.body}</p>
        <ol className="mt-auto grid gap-2.5 pt-1 sm:grid-cols-3">
          {recap.takeaways.map((t, i) => (
            <li key={t.title} className="swap-in flex flex-col gap-1 rounded-xl bg-muted/70 px-3.5 py-3" style={{ animationDelay: `${80 + i * 60}ms` }}>
              <span className="font-mono text-[10px] font-medium tracking-[0.14em] text-muted-foreground">0{i + 1}</span>
              <span className="text-sm font-semibold">{t.title}</span>
              <span className="text-[13px] leading-snug text-muted-foreground">{t.body}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col gap-2.5 border-t px-5 pb-4 pt-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold">How your holdings moved</span>
          <Link href="/dashboard" className="text-[13px] font-medium text-primary hover:text-foreground">
            All holdings
          </Link>
        </div>
        <ul className="flex flex-wrap gap-2">
          {moves.map(([symbol, day, week]) => (
            <li key={symbol} className="press inline-flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-1.5 transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-sm">
              <TickerLogo symbol={symbol} size="xs" className="size-6 rounded-full" />
              <span className="text-[13px] font-semibold">{symbol}</span>
              <Delta value={period === "day" ? day : week} size="sm" />
            </li>
          ))}
        </ul>
        <p className="mt-0.5 text-xs text-muted-foreground">Written with AI from cited sources and verified closing prices. Not investment advice.</p>
      </div>
    </SectionCard>
  )
}
