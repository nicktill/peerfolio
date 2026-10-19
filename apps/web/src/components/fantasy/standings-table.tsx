"use client"

import { Fragment, useState } from "react"
import { ChevronDown, EyeOff } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { Delta } from "@web/components/ui/delta"
import { Sparkline } from "@web/components/ui/sparkline"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import type { Standing } from "@web/components/leagues/standing-row"
import { withShownWeights } from "@web/lib/percent-display"
import { visibleStandings } from "@web/lib/standings-window"
import { plural } from "@web/lib/plural"

const REACTIONS = ["🔥", "🚀", "👏", "🧊", "🤝", "😤"] as const

/** The league table: an open ledger with avatars, returns and weighted holding chips. */
export function StandingsTable({ standings, onReact }: { standings: Standing[]; onReact: (toUserId: string, emoji: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const view = visibleStandings(standings, { expanded })

  return (
    <div>
      <div className="fw-table-head" aria-hidden>
        <span />
        <span>Player</span>
        <span>Trend</span>
        <span>Return</span>
      </div>
      <ul className="fw-rows">
        {view.rows.map((s, i) => (
          <Fragment key={s.userId}>
            {s.inactive && !view.rows[i - 1]?.inactive ? (
              <li className="fw-inactive-divider" aria-hidden>
                Inactive · not ranked until they buy something
              </li>
            ) : null}
            <Row standing={s} onReact={onReact} />
          </Fragment>
        ))}
      </ul>
      {view.hidden > 0 || expanded ? (
        <button type="button" className="fw-more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show fewer" : `Show all ${standings.length}`}
          <ChevronDown aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

function Row({ standing, onReact }: { standing: Standing; onReact: (toUserId: string, emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  const name = standing.isYou ? "You" : (standing.name ?? standing.handle ?? "Member")

  return (
    <li
      className={`fw-standing ${standing.isYou ? "fw-you" : ""}`}
      data-medal={!standing.inactive && standing.rank <= 3 ? standing.rank : undefined}
      data-inactive={standing.inactive || undefined}
    >
      <span className="fw-avatar-slot" data-rank={standing.inactive ? undefined : standing.rank} aria-label={standing.inactive ? "Inactive" : `Rank ${standing.rank}`}>
        <Avatar src={standing.image} name={standing.name} handle={standing.handle} size="md" />
      </span>
      <div className="fw-standing-who">
        <strong>
          <span>{name}</span>
          {standing.isYou ? <span className="fw-you-tag">you</span> : null}
        </strong>
        <span className="fw-handle">{standing.handle ? `@${standing.handle}` : plural(standing.days, "day")}</span>
      </div>
      <div className="fw-spark">{standing.inactive ? null : <Sparkline points={standing.spark} className="hidden shrink-0 sm:block" />}</div>
      <div className="fw-return">
        {standing.inactive ? <span className="fw-inactive-tag">Inactive</span> : <Delta value={standing.percent} size="md" variant="plain" />}
      </div>

      <div className="fw-standing-extras">
        {standing.shareHoldings && standing.holdings.length > 0 ? (
          withShownWeights(standing.holdings.slice(0, 4)).map((h) => (
            <span
              key={h.ticker}
              className="fw-chip"
              style={{ "--weight": `${Math.min(100, Math.max(0, h.weight))}%` } as React.CSSProperties}
              title={`${h.name ?? h.ticker}: ${h.weight.toFixed(1)}% of their portfolio`}
            >
              <i aria-hidden />
              <TickerLogo symbol={h.ticker} size="xs" className="rounded-full border-0 shadow-none" />
              <b>{h.ticker}</b>
              <small>{h.shownWeight}%</small>
            </span>
          ))
        ) : standing.shareHoldings ? (
          // Sharing is on but there's nothing to show yet. Not the same as private.
          <span className="fw-private">Nothing held yet</span>
        ) : (
          <span className="fw-private">
            <EyeOff aria-hidden />
            Holdings private
          </span>
        )}

        <div className="fw-react-bar">
          {Object.entries(standing.reactions).map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              className="fw-react numeric"
              onClick={() => !standing.isYou && onReact(standing.userId, emoji)}
              disabled={standing.isYou}
            >
              <span aria-hidden>{emoji}</span>
              {count}
            </button>
          ))}
          {!standing.isYou ? (
            <div className="fw-react-add">
              <button type="button" className="fw-react" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`React to ${name}`}>
                +
              </button>
              {open ? (
                <div className="fw-react-menu">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReact(standing.userId, emoji)
                        setOpen(false)
                      }}
                    >
                      <span aria-hidden>{emoji}</span>
                      <span className="sr-only">React with {emoji}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}
