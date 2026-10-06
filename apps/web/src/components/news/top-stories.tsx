import { ArrowUpRight } from "lucide-react"
import { SectionCard } from "@web/components/ui/section-card"
import { formatRelativeTime } from "@web/lib/format"

export type Headline = { source: string; title: string; url: string; summary: string | null; publishedAt: string }

/** The freshest headlines from the publishers' feeds, each linking to the original story. */
export function TopStories({ headlines, index }: { headlines: Headline[]; index: number }) {
  return (
    <SectionCard label="Top stories" index={index} action={<span className="pr-2 text-xs text-muted-foreground">From publishers’ feeds</span>} className="lg:col-span-2">
      <ul className="grid sm:grid-cols-2">
        {headlines.map((h, i) => (
          <li key={h.url} className={i > 0 ? "border-t sm:[&:nth-child(2)]:border-t-0 sm:odd:border-r" : "sm:border-r"}>
            <a href={h.url} target="_blank" rel="noopener noreferrer" className="group flex h-full flex-col gap-1 px-5 py-3.5 transition-colors hover:bg-secondary/40">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-medium">{h.source}</span>
                <span aria-hidden>·</span>
                <span>{formatRelativeTime(h.publishedAt)}</span>
                <ArrowUpRight className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </span>
              <span className="text-sm font-medium leading-snug group-hover:underline group-hover:underline-offset-2">{h.title}</span>
              {h.summary ? <span className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{h.summary}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
