import { ArrowUpRight } from "lucide-react"
import { SectionCard } from "@web/components/ui/section-card"
import { formatRelativeTime } from "@web/lib/format"

export type Headline = { source: string; title: string; url: string; summary: string | null; publishedAt: string }

/** A steady colour per publisher, so the list is easy to scan by source. */
function sourceHue(source: string) {
  let h = 0
  for (const c of source) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

function Byline({ h }: { h: Headline }) {
  return (
    <span className="nw-by">
      <i style={{ backgroundColor: `hsl(${sourceHue(h.source)} 45% 55%)` }} aria-hidden />
      <b>{h.source}</b>
      <span aria-hidden>·</span>
      <span>{formatRelativeTime(h.publishedAt)}</span>
      <ArrowUpRight className="nw-by-go" aria-hidden />
    </span>
  )
}

/** The freshest headlines from the publishers' feeds, the newest one featured, each linking to the original story. */
export function TopStories({ headlines, index }: { headlines: Headline[]; index: number }) {
  const [lead, ...rest] = headlines
  if (!lead) return null
  return (
    <SectionCard label="Top stories" index={index} action={<span className="nw-end">From publishers’ feeds</span>} className="nw-wide">
      <a href={lead.url} target="_blank" rel="noopener noreferrer" className="nw-lead-story">
        <Byline h={lead} />
        <b>{lead.title}</b>
        {lead.summary ? <p>{lead.summary}</p> : null}
      </a>
      <ul className="nw-stories">
        {rest.map((h) => (
          <li key={h.url}>
            <a href={h.url} target="_blank" rel="noopener noreferrer" className="nw-story">
              <Byline h={h} />
              <b>{h.title}</b>
              {h.summary ? <p>{h.summary}</p> : null}
            </a>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
