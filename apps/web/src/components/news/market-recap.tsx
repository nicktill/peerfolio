import Link from "next/link"
import { ArrowUpRight, Sparkles } from "lucide-react"
import { Delta } from "@web/components/ui/delta"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import { SectionCard } from "@web/components/ui/section-card"

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

/** A short read, three takeaways with their sources, then how the day touched your holdings. The headline lives in the page head. */
export function MarketRecap({
  recap,
  moves,
  swapKey,
  index,
}: {
  recap: RecapView
  moves: { symbol: string; percent: number }[] | null
  swapKey: string
  index: number
}) {
  return (
    <SectionCard
      label={recap.title}
      index={index}
      action={
        <span className="nw-end nw-stamp">
          {recap.kind === "sample" ? <span className="pf-chip nw-sample">Sample</span> : recap.kind === "ai" ? <Sparkles className="size-3.5" aria-hidden /> : null}
          {recap.stamp}
        </span>
      }
    >
      {/* Keyed on the period: the story swaps with a soft crossfade instead of snapping. */}
      <div key={swapKey} className="swap-in nw-recap">
        <div className="nw-body">
          {recap.body.split(/\n\s*\n/).map((paragraph, i) => (
            <p key={i}>{paragraph.trim()}</p>
          ))}
        </div>
        {recap.takeaways.length > 0 ? (
          <ol className="nw-takes">
            {recap.takeaways.map((t, i) => (
              <li key={`${t.title}-${i}`} className="swap-in nw-take" style={{ animationDelay: `${80 + i * 60}ms` }}>
                <span className="nw-take-t">
                  <i className="numeric" aria-hidden>
                    {i + 1}
                  </i>
                  <b>{t.title}</b>
                </span>
                <p>{t.body}</p>
                {t.sources?.length ? (
                  <span className="nw-take-src">
                    {t.sources.map((s) => (
                      <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}>
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
        <details className="nw-read">
          <summary>
            <span>
              Based on {recap.sources.length} {recap.sources.length === 1 ? "story" : "stories"} from {[...new Set(recap.sources.map((s) => s.source))].join(", ")}
            </span>
            <span aria-hidden>+</span>
          </summary>
          <ul>
            {recap.sources.map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  <b>{s.source}</b>
                  <span>{s.title}</span>
                  <ArrowUpRight className="mt-1 size-3 shrink-0" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {moves && moves.length > 0 ? (
        <div className="nw-holds">
          <div className="nw-group">
            <span>How your holdings moved</span>
            <Link href="/dashboard">All holdings</Link>
          </div>
          <ul className="nw-moves">
            {moves.map((m) => (
              <li key={m.symbol} className="nw-move">
                <TickerLogo symbol={m.symbol} size="xs" className="size-6 rounded-full" />
                <b>{m.symbol}</b>
                <Delta value={m.percent} size="sm" variant="plain" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="pf-foot">
        {recap.kind === "ai"
          ? "Written with AI from the linked stories only, then checked: every figure must appear in a source. Not investment advice."
          : recap.kind === "fallback"
            ? "Today’s top headlines, straight from the publishers. Not investment advice."
            : "Sample copy. The live recap appears after the next market close."}
      </p>
    </SectionCard>
  )
}
