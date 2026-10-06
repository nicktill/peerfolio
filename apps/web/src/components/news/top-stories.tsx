import { ArrowUpRight, Newspaper } from "lucide-react"
import { SectionCard } from "@web/components/ui/section-card"
import { formatRelativeTime } from "@web/lib/format"
import { cn } from "@web/lib/utils"

export type Headline = { source: string; title: string; url: string; summary: string | null; publishedAt: string }

/** A steady colour per publisher, so the list is easy to scan by source. */
function sourceHue(source: string) {
  let h = 0
  for (const c of source) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

function Byline({ h }: { h: Headline }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2 rounded-full" style={{ backgroundColor: `hsl(${sourceHue(h.source)} 65% 55%)` }} aria-hidden />
      <span className="font-medium text-foreground/80">{h.source}</span>
      <span aria-hidden>·</span>
      <span>{formatRelativeTime(h.publishedAt)}</span>
      <ArrowUpRight className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </span>
  )
}

/** The freshest headlines from the publishers' feeds, the newest one featured, each linking to the original story. */
export function TopStories({ headlines, index }: { headlines: Headline[]; index: number }) {
  const [lead, ...rest] = headlines
  if (!lead) return null
  return (
    <SectionCard
      label="Top stories"
      icon={<Newspaper />}
      tone="pink"
      index={index}
      action={<span className="pr-2 text-xs text-muted-foreground">From publishers’ feeds</span>}
      className="lg:col-span-2"
    >
      <a href={lead.url} target="_blank" rel="noopener noreferrer" className="group surface-hero flex flex-col gap-2 border-b px-5 py-5 transition-colors hover:bg-secondary/30">
        <Byline h={lead} />
        <span className="text-balance font-display text-xl font-semibold leading-snug tracking-tight group-hover:underline group-hover:underline-offset-4">{lead.title}</span>
        {lead.summary ? <span className="max-w-[80ch] text-sm leading-relaxed text-muted-foreground">{lead.summary}</span> : null}
      </a>
      <ul className="grid sm:grid-cols-2">
        {rest.map((h, i) => (
          <li key={h.url} className={cn(i > 0 && "border-t", i === 1 && "sm:border-t-0", i % 2 === 0 && "sm:border-r")}>
            <a href={h.url} target="_blank" rel="noopener noreferrer" className="group flex h-full flex-col gap-1 px-5 py-3.5 transition-colors hover:bg-secondary/40">
              <Byline h={h} />
              <span className="text-sm font-medium leading-snug group-hover:underline group-hover:underline-offset-2">{h.title}</span>
              {h.summary ? <span className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{h.summary}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
