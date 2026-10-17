import type { LucideIcon } from "lucide-react"
import "@web/components/ui/empty-ghost.css"

type Kind = "portfolio" | "board" | "leagues"

const GHOSTS: Record<Kind, React.ReactNode> = {
  // A chart drawing itself over a faint grid, with rows of holdings underneath.
  portfolio: (
    <svg viewBox="0 0 600 340" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {[70, 120, 170].map((y) => <path key={y} className="eg-grid" d={`M0 ${y}H600`} />)}
      <path className="eg-fill" d="M0 190 L70 168 L140 176 L210 130 L280 142 L350 96 L420 112 L490 58 L560 70 L600 40 V250 H0Z" />
      <path className="eg-line" pathLength={1} d="M0 190 L70 168 L140 176 L210 130 L280 142 L350 96 L420 112 L490 58 L560 70 L600 40" />
      {[0, 1, 2].map((i) => (
        <g key={i} className="eg-pulse" style={{ animationDelay: `${-i * 0.9}s` }}>
          <circle className="eg-dot" cx="40" cy={282 + i * 22} r="7" />
          <rect className="eg-bar" x="58" y={277 + i * 22} width={150 - i * 24} height="10" rx="5" />
          <rect className="eg-bar" x="500" y={277 + i * 22} width="60" height="10" rx="5" />
        </g>
      ))}
    </svg>
  ),
  // A ranked list: rank, avatar, name bar, sparkline, return.
  board: (
    <svg viewBox="0 0 600 340" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} className="eg-pulse" style={{ animationDelay: `${-i * 0.6}s` }} transform={`translate(0 ${i * 62 + 14})`}>
          <rect className="eg-bar" x="24" y="14" width="14" height="14" rx="4" />
          <circle className="eg-dot" cx="72" cy="21" r="14" />
          <rect className="eg-bar" x="100" y="10" width={130 - i * 12} height="9" rx="4.5" />
          <rect className="eg-bar" x="100" y="26" width="70" height="7" rx="3.5" />
          <path className="eg-grid" style={{ opacity: 0.4, strokeDasharray: "none" }} d={`M330 28 L360 ${18 - i} L390 24 L420 12 L450 ${16 - i}`} fill="none" />
          <rect className="eg-bar" x="500" y="12" width="72" height="18" rx="9" />
        </g>
      ))}
    </svg>
  ),
  // A quiet race of return lines; the invitation has its own clear space in the centre.
  leagues: (
    <svg viewBox="0 0 1200 340" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {[64, 128, 192, 256].map((y) => <path key={y} className="eg-grid" d={`M0 ${y}H1200`} />)}
      <g className="eg-league-lines">
        <path d="M-20 272 L42 251 L88 262 L136 218 L182 230 L232 174 L278 191 L326 145" />
        <path d="M-20 302 L42 280 L88 288 L136 265 L182 274 L232 239 L278 252 L326 222" />
        <path d="M874 180 L922 157 L968 174 L1016 123 L1062 137 L1110 84 L1156 98 L1220 47" />
        <path d="M874 250 L922 225 L968 239 L1016 205 L1062 212 L1110 179 L1156 188 L1220 142" />
      </g>
      <g className="eg-league-points">
        <circle cx="232" cy="174" r="5" />
        <circle cx="1110" cy="84" r="5" />
        <circle cx="136" cy="265" r="4" />
        <circle cx="1016" cy="205" r="4" />
      </g>
    </svg>
  ),
}

/**
 * An empty page that doesn't look empty: a faded sketch of what the screen will hold sits behind a short
 * invitation. `actions` holds the main button and, where one exists, the sample-data link.
 */
export function EmptyGhost({ kind, icon: Icon, title, body, actions }: { kind: Kind; icon: LucideIcon; title: string; body: string; actions?: React.ReactNode }) {
  return (
    <div className="eg" data-kind={kind}>
      <div className="eg-ghost">{GHOSTS[kind]}</div>
      <div className="eg-body">
        <span className="eg-mark" aria-hidden><Icon /></span>
        <h3 className="eg-title">{title}</h3>
        <p className="eg-text">{body}</p>
        {actions ? <div className="eg-actions">{actions}</div> : null}
      </div>
    </div>
  )
}
