import "@web/components/ui/empty-scene.css"

type Kind = "leagues" | "picks" | "trophies" | "feed"

const SCENES: Record<Kind, React.ReactNode> = {
  // A chart drawing itself next to a coin.
  leagues: (
    <svg viewBox="0 0 160 100" aria-hidden>
      <path className="es-axis" d="M16 86h128M16 86V14" />
      <path className="es-draw" pathLength={1} d="M22 74 L52 58 L76 66 L102 38 L124 46 L146 20" />
      <circle className="es-coin" cx="146" cy="20" r="7" />
      <text x="146" y="24" textAnchor="middle" className="es-coin-t">$</text>
    </svg>
  ),
  // A ticket with a question mark, bobbing.
  picks: (
    <svg viewBox="0 0 160 100" aria-hidden>
      <g className="es-float">
        <path className="es-ticket" d="M32 26h96a6 6 0 0 1 6 6v10a8 8 0 0 0 0 16v10a6 6 0 0 1-6 6H32a6 6 0 0 1-6-6V58a8 8 0 0 0 0-16V32a6 6 0 0 1 6-6z" />
        <path className="es-perf" d="M104 30v40" />
        <text x="62" y="62" textAnchor="middle" className="es-q">?</text>
        <path className="es-line" d="M114 44h12M114 52h8" />
      </g>
    </svg>
  ),
  // An empty shelf with a ghost cup that shines.
  trophies: (
    <svg viewBox="0 0 160 100" aria-hidden>
      <path className="es-shelf" d="M24 78h112" />
      <g className="es-ghost">
        <path d="M68 30h24v14c0 8-5 13-12 13S68 52 68 44z" />
        <path d="M68 34h-8c0 8 3 11 8 12M92 34h8c0 8-3 11-8 12" fill="none" />
        <path d="M78 57v8M70 65h20" />
      </g>
      <path className="es-spark" d="M110 28l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
      <path className="es-spark es-spark-2" d="M50 38l1.5 3.5 3.5 1.5-3.5 1.5L50 48l-1.5-3.5L45 43l3.5-1.5z" />
    </svg>
  ),
  // Speech bubbles trading places.
  feed: (
    <svg viewBox="0 0 160 100" aria-hidden>
      <g className="es-float">
        <path className="es-bub" d="M24 28h62a8 8 0 0 1 8 8v14a8 8 0 0 1-8 8H48l-12 10V58h-12a8 8 0 0 1-8-8V36a8 8 0 0 1 8-8z" transform="translate(4 -2)" />
        <path className="es-line" d="M36 40h38M36 48h24" />
      </g>
      <g className="es-float es-float-2">
        <path className="es-bub es-bub-2" d="M82 54h52a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8h-8v10l-12-10H82a8 8 0 0 1-8-8V62a8 8 0 0 1 8-8z" transform="translate(0 -14)" />
        <path className="es-line" d="M88 60h32M88 68h20" transform="translate(0 -14)" />
      </g>
    </svg>
  ),
}

/** An empty state with a small moving illustration, a line of copy, and one action. */
export function EmptyScene({ kind, title, body, action }: { kind: Kind; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="es" data-kind={kind}>
      <div className="es-art">{SCENES[kind]}</div>
      <p className="es-title">{title}</p>
      {body ? <p className="es-body">{body}</p> : null}
      {action ? <div className="es-action">{action}</div> : null}
    </div>
  )
}
