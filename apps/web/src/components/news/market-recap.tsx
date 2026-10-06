import Link from "next/link"
import { ArrowUpRight, Sparkles } from "lucide-react"
import { Badge } from "@web/components/ui/badge"
import { Delta } from "@web/components/ui/delta"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import { IconChip, SectionCard, type ChipTone } from "@web/components/ui/section-card"
import { cn } from "@web/lib/utils"

export type RecapSource = { id: string; source: string; title: string; url: string }

export type RecapView = {
  title: string
  stamp: string
  headline: string
  body: string
  takeaways: { title: string; body: string; sources?: RecapSource[] }[]
  /** Every source the recap cites, listed under it. */
  sources?: RecapSource[]
  /** "sample" for placeholder copy, "fallback" for a headline-only recap written without AI. */
  kind: "ai" | "fallback" | "sample"
}

/** Headline, a short read, three takeaways with their sources, then how the day touched your holdings. */
const TAKEAWAY_TONES: ChipTone[] = ["blue", "orange", "violet"]

export function MarketRecap({
  recap,
  moves,
  swapKey,
  index,
  showHeadline = true,
}: {
  recap: RecapView
  moves: { symbol: string; percent: number }[] | null
  swapKey: string
  index: number
  /** Off when the page hero already shows the headline. */
  showHeadline?: boolean
}) {
  return (
    <SectionCard
      label={recap.title}
      icon={<Sparkles />}
      tone="primary"
      index={index}
      action={
        <span className="inline-flex items-center gap-1.5 pr-2 text-xs text-muted-foreground">
          {recap.kind === "sample" ? (
            <Badge variant="outline" className="border-dashed">
              Sample
            </Badge>
          ) : recap.kind === "ai" ? (
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          ) : null}
          {recap.stamp}
        </span>
      }
    >
      {/* Keyed on the period: the story swaps with a soft crossfade instead of snapping. */}
      <div key={swapKey} className="swap-in flex flex-1 flex-col gap-3.5 p-5">
        {showHeadline ? <h3 className="text-balance font-display text-[27px] font-semibold leading-[1.15] tracking-tight">{recap.headline}</h3> : null}
        <div className={cn("flex flex-col gap-3", showHeadline ? "max-w-[64ch] text-[15px] leading-relaxed text-muted-foreground" : "max-w-[66ch] text-base leading-relaxed text-foreground/85")}>
          {recap.body.split(/\n\s*\n/).map((paragraph, i) => (
            <p key={i}>{paragraph.trim()}</p>
          ))}
        </div>
        {recap.takeaways.length > 0 ? (
          <ol className="mt-auto grid gap-2.5 pt-1 sm:grid-cols-3">
            {recap.takeaways.map((t, i) => (
              <li key={`${t.title}-${i}`} className="swap-in flex flex-col gap-1 rounded-xl bg-muted/70 px-3.5 py-3" style={{ animationDelay: `${80 + i * 60}ms` }}>
                <span className="flex items-center gap-2">
                  <IconChip tone={TAKEAWAY_TONES[i % 3]} className="font-display text-[11px] font-bold">
                    {i + 1}
                  </IconChip>
                  <span className="text-sm font-semibold">{t.title}</span>
                </span>
                <span className="text-[13px] leading-snug text-muted-foreground">{t.body}</span>
                {t.sources?.length ? (
                  <span className="mt-auto flex flex-wrap gap-x-2 pt-1 text-[11px]">
                    {t.sources.map((s) => (
                      <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" title={s.title} className="font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                        {s.source}
                      </a>
                    ))}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {recap.sources?.length ? (
        <details className="group border-t px-5 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span>
              Based on {recap.sources.length} {recap.sources.length === 1 ? "story" : "stories"} from {[...new Set(recap.sources.map((s) => s.source))].join(", ")}
            </span>
            <span className="transition-transform group-open:rotate-45" aria-hidden>
              +
            </span>
          </summary>
          <ul className="mt-2.5 space-y-1.5">
            {recap.sources.map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="group/link inline-flex items-start gap-1.5 text-[13px] leading-snug hover:text-foreground">
                  <span className="shrink-0 font-medium text-muted-foreground">{s.source}</span>
                  <span className="text-muted-foreground group-hover/link:text-foreground">{s.title}</span>
                  <ArrowUpRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex flex-col gap-2.5 border-t px-5 pb-4 pt-3.5">
        {moves && moves.length > 0 ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold">How your holdings moved</span>
              <Link href="/dashboard" className="text-[13px] font-medium text-primary hover:text-foreground">
                All holdings
              </Link>
            </div>
            <ul className="flex flex-wrap gap-2">
              {moves.map((m) => (
                <li key={m.symbol} className="press inline-flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-1.5 transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-sm">
                  <TickerLogo imageEnabled={false} symbol={m.symbol} size="xs" className="size-6 rounded-full" />
                  <span className="text-[13px] font-semibold">{m.symbol}</span>
                  <Delta value={m.percent} size="sm" />
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {recap.kind === "ai"
            ? "Written with AI from the linked stories only, then checked: every figure must appear in a source. Not investment advice."
            : recap.kind === "fallback"
              ? "Today’s top headlines, straight from the publishers. Not investment advice."
              : "Sample copy. The live recap appears after the next market close."}
        </p>
      </div>
    </SectionCard>
  )
}
