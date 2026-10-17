"use client"

import "@web/components/sports/mode-switch.css"

import { useCallback, useEffect, useRef, useState } from "react"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import dynamic from "next/dynamic"
import { useSportsAccess, useSportsEnabled } from "@web/components/sports/use-sports-enabled"

// Pulls in the team tables via TeamBadge, so it is split out of the Fantasy page's first load.
const ArenaMatchups = dynamic(() => import("@web/components/sports/arena-matchups").then((m) => m.ArenaMatchups))

export type FantasyMode = "stocks" | "sports"

const KEY = "pf.fantasy.mode"
const MODES: FantasyMode[] = ["stocks", "sports"]
export const MODE_PANEL_ID = "fantasy-mode-panel"
export const modeTabId = (mode: FantasyMode) => `fantasy-mode-${mode}`

/**
 * Which side of Fantasy is showing, remembered per browser. Stocks is the
 * default and the only option unless the `sportsEnabled` flag is on, so
 * existing users see no change. Storage can be blocked, so every access is guarded.
 */
export function useFantasyMode(): [FantasyMode, (mode: FantasyMode) => void, (mode: FantasyMode) => void] {
  const [mode, setMode] = useState<FantasyMode>("stocks")
  const enabled = useSportsEnabled()
  useEffect(() => {
    if (!enabled) return
    try {
      // This tab's last side wins (so "Fantasy leagues" from a sports league lands back on Sports), then the
      // side you last picked on the switch, and a first visit is always Stocks.
      const here = window.sessionStorage.getItem(KEY)
      const saved = here ?? window.localStorage.getItem(KEY)
      if (saved === "sports") setMode("sports")
    } catch {
      /* storage blocked: stay on Stocks */
    }
  }, [enabled])
  /** An explicit pick on the switch: remembered for next time. */
  const choose = useCallback((next: FantasyMode) => {
    setMode(next)
    try {
      window.localStorage.setItem(KEY, next)
      window.sessionStorage.setItem(KEY, next)
    } catch {
      /* not remembered, still works */
    }
  }, [])
  /** Landing somewhere inside a side (a sports league page): this tab remembers it, but it does not change the saved default. */
  const visit = useCallback((next: FantasyMode) => {
    try {
      window.sessionStorage.setItem(KEY, next)
    } catch {
      /* ignore */
    }
  }, [])
  return [enabled ? mode : "stocks", choose, visit]
}

/**
 * A real tablist: roving tabindex, arrow keys / Home / End move and select,
 * and the selected tab controls the panel the page wraps in MODE_PANEL_ID.
 */
export function ModeSwitch({ mode, onChange }: { mode: FantasyMode; onChange: (mode: FantasyMode) => void }) {
  const refs = useRef<Record<FantasyMode, HTMLButtonElement | null>>({ stocks: null, sports: null })
  const access = useSportsAccess()
  // Access still unknown (no server answer): hold the cards' exact space so nothing shifts when it arrives.
  if (access === null) return <ModeSwitchSkeleton />
  if (!access) return null

  function onKeyDown(event: React.KeyboardEvent) {
    const i = MODES.indexOf(mode)
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? MODES[(i + 1) % MODES.length]
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? MODES[(i + MODES.length - 1) % MODES.length]
      : event.key === "Home" ? MODES[0]
      : event.key === "End" ? MODES[MODES.length - 1]
      : null
    if (!next) return
    event.preventDefault()
    onChange(next)
    refs.current[next]?.focus()
  }

  const COPY: Record<FantasyMode, { name: string; line: string; tag: string }> = {
    stocks: { name: "Stocks", line: "Play-money portfolios. Beat your friends' returns.", tag: "The Floor" },
    sports: { name: "Sports", line: "Pregame picks on NFL, NBA, NHL, MLB, MLS, CFB.", tag: "The Arena" },
  }
  return (
    <div className="sp-stage" role="tablist" aria-label="Fantasy type" data-mode={mode} onKeyDown={onKeyDown}>
      {MODES.map((m) => (
        <button
          key={m}
          ref={(el) => {
            refs.current[m] = el
          }}
          type="button"
          role="tab"
          id={modeTabId(m)}
          aria-selected={mode === m}
          aria-controls={MODE_PANEL_ID}
          tabIndex={mode === m ? 0 : -1}
          onClick={() => onChange(m)}
          className="sp-world"
          data-world={m}
        >
          <span className="sp-world-art" aria-hidden>
            {m === "stocks" ? <FloorArt /> : <ArenaArt />}
          </span>
          <span className="sp-world-copy">
            <small>{COPY[m].tag}</small>
            <strong>{COPY[m].name}</strong>
            <em>{COPY[m].line}</em>
          </span>
          <span className="sp-world-dot" aria-hidden />
        </button>
      ))}
    </div>
  )
}

/** The two cards at their real size with the real labels and grey bars (the News skeleton pattern). */
function ModeSwitchSkeleton() {
  return (
    <div className="sp-stage" data-mode="stocks" aria-busy="true" aria-label="Loading fantasy types">
      {MODES.map((m) => (
        <div key={m} className="sp-world sp-world-sk" data-world={m} aria-selected={m === "stocks"}>
          <span className="sp-world-copy">
            <small>{m === "stocks" ? "The Floor" : "The Arena"}</small>
            <span className="pf-sk" style={{ height: 30, width: "46%", marginTop: 6 }} />
            <span className="pf-sk" style={{ height: 13, width: "70%", marginTop: 8 }} />
          </span>
        </div>
      ))}
    </div>
  )
}

/** Stocks: a rising line that draws itself over a ticker tape. */
function FloorArt() {
  return (
    <>
      <svg className="fa-chart" viewBox="0 0 400 140" preserveAspectRatio="none">
        <defs>
          <linearGradient id="fa-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3fae7f" stopOpacity=".35" />
            <stop offset="1" stopColor="#3fae7f" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="fa-area" d="M0 120 L40 104 L80 112 L120 86 L160 92 L200 64 L240 72 L280 40 L320 52 L360 20 L400 28 L400 140 L0 140Z" fill="url(#fa-fill)" />
        <path className="fa-line" pathLength={1} d="M0 120 L40 104 L80 112 L120 86 L160 92 L200 64 L240 72 L280 40 L320 52 L360 20 L400 28" />
        <circle className="fa-dot" cx="400" cy="28" r="5" />
      </svg>
      <FloorBubbles />
    </>
  )
}

/** Sports: stadium lights sweeping over field lines, with a flickering scoreboard. */
function ArenaArt() {
  return (
    <>
      <span className="ar-beam ar-beam-a" />
      <span className="ar-beam ar-beam-b" />
      <svg className="ar-field" viewBox="0 0 400 140" preserveAspectRatio="none">
        <g fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".5">
          <rect x="14" y="14" width="372" height="112" rx="6" />
          <path d="M200 14v112" />
          <circle cx="200" cy="70" r="24" />
          <path d="M14 46h34v48H14M386 46h-34v48h34" />
        </g>
      </svg>
      <ArenaMatchups />
    </>
  )
}

/** The tabpanel the switch controls. With the flag off it adds nothing at all (a fragment). */
export function ModePanel({ mode, children }: { mode: FantasyMode; children: React.ReactNode }) {
  const enabled = useSportsEnabled()
  if (!enabled) return <>{children}</>
  return (
    <div className="fw" role="tabpanel" id={MODE_PANEL_ID} aria-labelledby={modeTabId(mode)}>
      {children}
    </div>
  )
}

/**
 * The whole page's atmosphere for the world you are in: drifting chart lines and tape for Stocks,
 * sweeping stadium lights and field markings for Sports. Re-keyed on switch so it washes in from the stage.
 */
export function WorldAmbient({ world }: { world: FantasyMode }) {
  const enabled = useSportsEnabled()
  if (!enabled) return null
  return (
    <div className="wa" key={world} data-world={world} aria-hidden>
      {world === "stocks" ? (
        <>
          <svg className="wa-chart" viewBox="0 0 1200 600" preserveAspectRatio="none">
            <path d="M0 460 C 120 440, 200 480, 320 420 S 520 380, 640 330 S 860 300, 980 220 S 1120 160, 1200 120" />
            <path d="M0 520 C 140 500, 240 520, 360 470 S 560 450, 700 400 S 900 380, 1020 320 S 1140 280, 1200 240" />
            <path d="M0 560 C 160 548, 260 556, 400 520 S 600 510, 760 470 S 960 450, 1200 400" />
          </svg>
          <span className="wa-grid" />
          <span className="wa-glyphs">
            {["$", "▲", "%", "◆", "$", "▲", "%", "◆", "$", "%"].map((g, i) => (
              <i key={i} style={{ "--i": i } as React.CSSProperties}>
                {g}
              </i>
            ))}
          </span>
        </>
      ) : (
        <>
          <span className="wa-beam wa-beam-a" />
          <span className="wa-beam wa-beam-b" />
          <svg className="wa-field" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
            <g fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="60" y="80" width="1080" height="540" rx="14" />
              <path d="M600 80v540" />
              <circle cx="600" cy="350" r="90" />
              <path d="M60 230h130v240H60M1140 230H1010v240h130" />
            </g>
          </svg>
          <span className="wa-dust">
            {Array.from({ length: 18 }, (_, i) => (
              <i key={i} style={{ "--i": i } as React.CSSProperties} />
            ))}
          </span>
        </>
      )}
      <span className="wa-wash" />
    </div>
  )
}

/** A value that rolls into place (slides up and fades in) whenever it changes. */
function Typed({ text }: { text: string }) {
  return (
    <span key={text} className="roll">
      {text}
    </span>
  )
}

const SYMBOLS = ["AAPL", "META", "NVDA", "TSLA", "MSFT", "AMZN", "COIN", "GOOGL", "NFLX", "SPY"]
const fmt = (n: number) => `${n >= 0 ? "+" : "\u2212"}${Math.abs(n).toFixed(1)}%`

/** Company bubbles drifting over the Stocks panel; each one swaps company and ticks its move every few seconds. */
function FloorBubbles() {
  const [slots, setSlots] = useState(() => [0, 3, 6, 1].map((i, k) => ({ sym: SYMBOLS[i]!, pct: [2.4, -1.2, 5.1, 0.9][k]! })))
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let tick = 0
    const id = setInterval(() => {
      tick++
      setSlots((cur) =>
        cur.map((s, k) => {
          // Each bubble swaps company on its own beat; in between its percentage just wobbles.
          if ((tick + k * 2) % 8 === 0) {
            const used = new Set(cur.map((c) => c.sym))
            const pool = SYMBOLS.filter((x) => !used.has(x))
            return { sym: pool[Math.floor(Math.random() * pool.length)] ?? s.sym, pct: Math.round((Math.random() * 10 - 3.5) * 10) / 10 }
          }
          return { ...s, pct: Math.round((s.pct + (Math.random() - 0.5) * 1.4) * 10) / 10 }
        }),
      )
    }, 6000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="fb">
      {slots.map((s, k) => (
        <span key={k} className="fb-bubble" data-k={k} data-down={s.pct < 0 || undefined}>
          <span className="fb-logo" key={s.sym}>
            <TickerLogo symbol={s.sym} size="sm" className="rounded-full" />
          </span>
          <b>{s.sym}</b>
          <em className="numeric">
            <Typed text={fmt(s.pct)} />
          </em>
        </span>
      ))}
    </span>
  )
}
