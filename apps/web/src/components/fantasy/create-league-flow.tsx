"use client"

import "@web/components/fantasy/fantasy-workspace.css"
import "@web/components/fantasy/create-flow.css"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, ArrowRight, Check, Dices, X } from "lucide-react"
import { TeamBadge } from "@web/components/sports/team-badge"
import { InfoTip } from "@web/components/ui/tip"
import { useToast } from "@web/components/ui/toast"
import { LeagueBackdrop, LeagueMark } from "@web/components/league/league-mark"
import { LookPicker } from "@web/components/fantasy/league-look-picker"
import { mutate } from "@web/lib/use-api"
import { randomLook } from "@web/lib/league-look"

export type FlowKind = "fantasy" | "sports" | "league"

const NAMES_BY: Record<FlowKind, string[]> = {
  fantasy: ["Wolves of Main Street", "The Bull Pen", "Diamond Hands Club", "Friday Fund", "Green Candle Society", "Buy High Sell Higher", "The Group Chat Index", "Tendies & Tickers"],
  sports: ["Sunday Sharps", "Parlay Pals", "The Chalk Report", "Lock of the Week", "Fade the Public", "Back Door Cover", "Moneyline Mafia", "Juice & Variance"],
  league: ["The Long Game", "Index Fund Fan Club", "Compound Interest", "Buy and Hold Gang", "The Rebalancers", "Dividend Dynasty", "Retire Early Club", "Stonk Society"],
}
const KINDS: Record<FlowKind, { steps: readonly string[]; title: string; accent: string; emoji: string; sub: string }> = {
  fantasy: { steps: ["Name", "Look", "Format", "Stakes", "Launch"], title: "Start a fantasy league", accent: "emerald", emoji: "crest:shield:trending:glow:ticker", sub: "The name your group chat will use to talk trash." },
  sports: { steps: ["Name", "Look", "Sports", "Stakes", "Launch"], title: "Start a sports league", accent: "sky", emoji: "crest:hex:trophy:shimmer:stars", sub: "The name on the slip when someone's parlay hits." },
  league: { steps: ["Name", "Look", "Launch"], title: "Start a league", accent: "violet", emoji: "crest:circle:medal:float:aurora", sub: "A league for real portfolios. Pick a name people will want to join." },
}
const SPORTS = [
  { key: "nfl", label: "NFL", note: "Sundays, Mondays, Thursdays", team: "Kansas City Chiefs" },
  { key: "nba", label: "NBA", note: "Nightly in season", team: "Boston Celtics" },
  { key: "tennis", label: "Tennis", note: "Match winners and totals", team: "Carlos Alcaraz" },
  { key: "nhl", label: "NHL", note: "Nightly in season", team: "Boston Bruins" },
  { key: "mlb", label: "MLB", note: "Nearly every day, spring to fall", team: "New York Yankees" },
  { key: "cfb", label: "College football", note: "Saturdays in the fall", team: "Georgia Bulldogs" },
  { key: "mls", label: "MLS", note: "Spreads and totals", team: "Inter Miami CF" },
] as const
const CREDIT_STOPS = [250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000]


const money = (n: number) => (n >= 1_000_000 ? `$${n / 1_000_000}M` : `$${n / 1_000}K`)
const CASH_STOPS = [1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000]
const DAY_STOPS: (number | null)[] = [7, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365, null]
const CAP_STOPS: (number | null)[] = [5, 10, 15, 20, 25, 33, 50, 75, null]

const cashNote = (n: number) => (n <= 5_000 ? "Scrappy: every dollar counts" : n <= 25_000 ? "Small account energy" : n === 100_000 ? "The classic" : n < 1_000_000 ? "Room to swing" : n < 10_000_000 ? "Big swings" : "Absurd. We love it")
const daysLabel = (d: number | null) => (d === null ? "All-time" : d < 14 ? "1 week" : d % 7 === 0 && d < 30 ? `${d / 7} weeks` : d < 60 ? `${Math.round(d / 30)} month${d >= 45 ? "s" : ""}` : d < 365 ? `${Math.round(d / 30)} months` : "1 year")
const daysNote = (d: number | null) => (d === null ? "Never ends" : d <= 14 ? "A sprint" : d <= 45 ? "Sweet spot" : d <= 120 ? "A real season" : "The long game")
const capNote = (c: number | null) => (c === null ? "Go all in" : c <= 10 ? `At least ${Math.ceil(100 / c)} stocks. Disciplined` : c <= 25 ? `At least ${Math.ceil(100 / c)} stocks. Some spread` : "A couple of big bets allowed")

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!
}

/**
 * Start a fantasy league as a short walk: name it, dress it up, choose how it plays, set
 * the stakes, launch. One idea per screen, a live preview of the league above each one.
 */
export function CreateLeagueFlow({ kind = "fantasy", onClose, onCreated }: { kind?: FlowKind; onClose: () => void; onCreated?: () => void }) {
  const cfg = KINDS[kind]
  const STEPS = cfg.steps
  const NAMES = NAMES_BY[kind]
  const { toast } = useToast()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [placeholder] = useState(() => pick(NAMES))
  const [look, setLook] = useState({ emoji: cfg.emoji, accent: cfg.accent })
  const [description, setDescription] = useState("")
  const [sportKeys, setSportKeys] = useState<string[]>(["nfl"])
  const [credits, setCredits] = useState(1_000)
  const [weekly, setWeekly] = useState(true)
  const [cash, setCash] = useState<number>(100_000)
  const [days, setDays] = useState<number | null>(30)
  const [cap, setCap] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const finalName = name.trim() || placeholder
  const nameOk = finalName.length >= 2
  const last = step === STEPS.length - 1
  const key = STEPS[step]

  function go(next: number) {
    if (next < 0 || next >= STEPS.length) return
    setDir(next > step ? 1 : -1)
    setStep(next)
  }

  async function launch() {
    setSaving(true)
    const endsAt = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null
    try {
      if (kind === "fantasy") {
        const result = await mutate<{ league: { id: string } }>("/api/fantasy", {
          body: { name: finalName, emoji: look.emoji, accent: look.accent, startingCash: cash, maxPositionPct: cap, endsAt, season: weekly ? { mode: "trading", rounds: null, picks: 5 } : null },
        })
        window.location.href = `/fantasy/${result.league.id}`
      } else if (kind === "sports") {
        const result = await mutate<{ league: { id: string } }>("/api/sports/leagues", {
          body: { name: finalName, emoji: look.emoji, accent: look.accent, sports: sportKeys, startingCredits: credits, endsAt },
        })
        window.location.href = `/fantasy/sports/${result.league.id}`
      } else {
        await mutate("/api/leagues", { body: { name: finalName, emoji: look.emoji, accent: look.accent, description: description.trim() || undefined } })
        toast("League created.", "success")
        onCreated?.()
        onClose()
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't create that league.", "error")
      setSaving(false)
    }
  }

  function next() {
    if (key === "Name" && !nameOk) return
    if (key === "Sports" && sportKeys.length === 0) return toast("Pick at least one sport.", "error")
    if (last) void launch()
    else go(step + 1)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
      // Enter moves on from anywhere except a button (which would double-fire) or the emoji picker.
      if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement) && !saving) {
        event.preventDefault()
        next()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (!mounted) return null

  const summary =
    kind === "fantasy"
      ? [weekly ? "Long race + weekly rounds" : "The long race", money(cash), daysLabel(days), cap ? `max ${cap}% per pick` : "no pick cap"]
      : kind === "sports"
        ? [sportKeys.map((k) => SPORTS.find((x) => x.key === k)?.label).join(" · "), `${credits.toLocaleString()} play cash`, daysLabel(days)]
        : ["Real portfolios", "Invite by link", description.trim() ? "Has a description" : "No description"]

  return createPortal(
    <div className="fw cf" data-kind={kind} data-accent={look.accent} role="dialog" aria-modal="true" aria-label={cfg.title}>
      <div className="cf-bg" aria-hidden>
        <LeagueBackdrop value={look.emoji} />
      </div>
      <div className="cf-top">
        <button type="button" className="cf-x" onClick={onClose} aria-label="Close">
          <X aria-hidden />
        </button>
        <ol className="cf-steps" aria-label={`Step ${step + 1} of ${STEPS.length}`} style={{ "--p": step / (STEPS.length - 1) } as React.CSSProperties}>
          {STEPS.map((label, i) => (
            <li key={label} data-state={i < step ? "done" : i === step ? "now" : undefined}>
              <button type="button" disabled={i > step || saving} onClick={() => go(i)} aria-current={i === step ? "step" : undefined}>
                <i aria-hidden>{i < step ? <Check /> : i + 1}</i>
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ol>
        <span className="cf-spacer" aria-hidden />
      </div>

      <div className="cf-stage" ref={panel}>
        <div className="cf-chip" aria-hidden>
          <span className="cf-chip-mark"><LeagueMark value={look.emoji} accent={look.accent} size={30} /></span>
          <b>{name.trim() || "Your league"}</b>
        </div>

        <div key={step} className="cf-step" data-dir={dir}>
          {key === "Name" ? (
            <>
              <h2>What should we call it?</h2>
              <p className="cf-sub">{cfg.sub}</p>
              <input
                autoFocus
                className="cf-name"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder={placeholder}
                aria-label="League name"
              />
              <div className="cf-livecard" aria-hidden>
                <span className="cf-livecard-mark"><LeagueMark value={look.emoji} accent={look.accent} size={48} /></span>
                <div>
                  <b>{name.trim() || placeholder}</b>
                  <small>{kind === "fantasy" ? "5 players · $100,000 each" : kind === "sports" ? "5 players · 1,000 play cash each" : "Real portfolios · invite link"}</small>
                </div>
                <i className="cf-livecard-ret">{kind === "sports" ? "976" : kind === "fantasy" ? "+0.00%" : "#1"}</i>
              </div>
              {kind === "league" ? (
                <input className="cf-desc" value={description} maxLength={160} onChange={(e) => setDescription(e.target.value)} placeholder="One line about the league (optional)" aria-label="Description" />
              ) : null}
              <div className="cf-ideas">
                <button type="button" className="cf-link" onClick={() => setName(pick(NAMES.filter((n) => n !== name)))}>
                  <Dices aria-hidden /> Give me an idea
                </button>
              </div>
            </>
          ) : null}

          {key === "Look" ? (
            <>
              <h2>Give it a face.</h2>
              <p className="cf-sub">Pick a badge and a colour. Or let fate decide.</p>
              <LookPicker look={look} name={finalName} onChange={setLook} />
              <button type="button" className="cf-link" onClick={() => setLook(randomLook())}>
                <Dices aria-hidden /> Surprise me
              </button>
            </>
          ) : null}

          {key === "Format" ? (
            <>
              <h2>Add a weekly game?</h2>
              <p className="cf-sub">Every league has the long race: best total return wins. Weekly rounds add a second scoreboard on top.</p>
              <div className="cf-cards" role="radiogroup" aria-label="How the league plays">
                <div role="radio" tabIndex={0} className="cf-card" aria-checked={!weekly} data-on={!weekly || undefined} onClick={() => setWeekly(false)} onKeyDown={(e) => (e.key === " ") && (e.preventDefault(), setWeekly(false))}>
                  <svg className="cf-diagram" viewBox="0 0 200 72" aria-hidden>
                    <defs>
                      <linearGradient id="cf-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="currentColor" stopOpacity=".28" />
                        <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M8 54 C 40 52, 60 40, 92 42 S 150 22, 186 14 L186 66 L8 66Z" fill="url(#cf-area)" />
                    <path d="M8 58 C 44 56, 70 50, 100 52 S 150 38, 186 36" className="cf-l2" />
                    <path d="M8 56 C 40 60, 68 44, 100 48 S 152 30, 186 26" className="cf-l2" />
                    <path d="M8 54 C 40 52, 60 40, 92 42 S 150 22, 186 14" className="cf-l1" />
                    <circle cx="186" cy="14" r="4.5" className="cf-dot" />
                    <path d="M186 14V4m0 0 9 3-9 3" className="cf-flag" />
                  </svg>
                  <strong>The long race</strong>
                  <span>One scoreboard. Everyone starts level and trades; best total return when the league ends wins.</span>
                </div>
                <div role="radio" tabIndex={0} className="cf-card" aria-checked={weekly} data-on={weekly || undefined} onClick={() => setWeekly(true)} onKeyDown={(e) => (e.key === " ") && (e.preventDefault(), setWeekly(true))}>
                  <svg className="cf-diagram" viewBox="0 0 200 72" aria-hidden>
                    <path d="M8 40 C 40 38, 60 30, 92 32 S 150 16, 186 10" className="cf-l1" opacity=".5" />
                    {[18, 26, 20, 34, 22, 30, 24].map((h, i) => (
                      <g key={i}>
                        <rect x={10 + i * 26} y={68 - h} width="18" height={h} rx="5" data-win={i === 3 || undefined} />
                      </g>
                    ))}
                    <g className="cf-cup" transform="translate(91 14)">
                      <path d="M0 0h12v6c0 4-3 7-6 7s-6-3-6-7z" />
                      <path d="M0 2H-4c0 4 2 6 4 6M12 2h4c0 4-2 6-4 6" fill="none" strokeWidth="1.6" />
                      <rect x="4.5" y="13" width="3" height="4" />
                      <rect x="2" y="17" width="8" height="2.4" rx="1" />
                    </g>
                  </svg>
                  <strong>
                    Long race + weekly rounds
                    <InfoTip text="Every Monday a fresh weekly ranking. 1st earns one point per player, last earns one. Most points wins the season. The long race keeps running underneath." label="How weekly rounds work" />
                  </strong>
                  <em>Recommended</em>
                  <span>Two scoreboards: the long race, plus a weekly one that resets each Monday. Win weeks, earn points, collect trophies.</span>
                </div>
              </div>
              <p className="cf-fine">Nothing is lost either way. The long-race standings are always there, and you can add weekly rounds later from the league page.</p>
            </>
          ) : null}

          {key === "Sports" ? (
            <>
              <h2>What are you betting on?</h2>
              <p className="cf-sub">Pick one or more. Lines are fixed contest lines, never live odds, and it is all play money.</p>
              <div className="cf-sports" role="group" aria-label="Sports">
                {SPORTS.map((sp) => {
                  const on = sportKeys.includes(sp.key)
                  return (
                    <button key={sp.key} type="button" className="cf-sport" aria-pressed={on} onClick={() => setSportKeys((cur) => (cur.includes(sp.key) ? cur.filter((x) => x !== sp.key) : [...cur, sp.key]))}>
                      <TeamBadge sport={sp.key} name={sp.team} size={56} />
                      <strong>{sp.label}</strong>
                      <span>{sp.note}</span>
                      <i aria-hidden>{on ? <Check /> : null}</i>
                    </button>
                  )
                })}
              </div>
            </>
          ) : null}

          {key === "Stakes" ? (
            <>
              <h2>Set the stakes.</h2>
              <p className="cf-sub">All play money. Everyone starts with the same. Slide to anything you like.</p>
              {kind === "sports" ? (
                <StopSlider label="Starting cash" stops={CREDIT_STOPS} value={credits} onChange={setCredits} format={(n) => n.toLocaleString()} note={(n) => (n <= 500 ? "Every pick matters" : n === 1_000 ? "The standard bankroll" : n < 10_000 ? "Room to press" : "High roller")} />
              ) : (
                <StopSlider label="Starting cash" stops={CASH_STOPS} value={cash} onChange={setCash} format={money} note={cashNote} />
              )}
              <StopSlider label="How long" stops={DAY_STOPS} value={days} onChange={setDays} format={daysLabel} note={daysNote} />
              {kind === "fantasy" ? (
                <StopSlider label="Max per stock" tip="Caps how much of your cash can sit in one stock. 25% forces at least four stocks." stops={CAP_STOPS} value={cap} onChange={setCap} format={(c) => (c === null ? "No cap" : `${c}%`)} note={capNote} />
              ) : null}
              <p className="cf-vibe">
                {kind === "sports" ? `${credits.toLocaleString()} cash` : money(cash)} · {daysLabel(days)}
                {kind === "fantasy" ? <> · {cap ? `${cap}% cap` : "no cap"} <b>= {cap !== null && cap <= 10 ? "a disciplined league" : cap === null && cash >= 1_000_000 ? "pure chaos" : days !== null && days <= 14 ? "a quick sprint" : "a relaxed league"}</b></> : <b> = {days !== null && days <= 14 ? "a quick sprint" : "a proper season"}</b>}
              </p>
            </>
          ) : null}

          {key === "Launch" ? (
            <>
              <h2>Ready when you are.</h2>
              <p className="cf-sub">Here&apos;s the league. Launch it, then send the invite to the group chat.</p>
              <div className="cf-review">
                <span className="cf-review-mark"><LeagueMark value={look.emoji} accent={look.accent} size={80} /></span>
                <div>
                  <strong>{finalName}</strong>
                  <ul>
                    {summary.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="cf-foot">
        <button type="button" className="fw-btn" onClick={() => (step === 0 ? onClose() : go(step - 1))} disabled={saving}>
          {step === 0 ? "Cancel" : (<><ArrowLeft aria-hidden /> Back</>)}
        </button>
        <button type="button" className="fw-btn cf-next" data-last={last || undefined} data-solid disabled={saving || (step === 0 && !nameOk)} aria-busy={saving || undefined} onClick={next}>
          {last ? (saving ? "Launching…" : `Launch ${finalName.length > 18 ? "league" : finalName}`) : (<>Continue <ArrowRight aria-hidden /></>)}
        </button>
        <span className="cf-hint" aria-hidden>
          press <kbd>Enter</kbd>
        </span>
      </div>
    </div>,
    document.body,
  )
}

function StopSlider<T extends number | null>({ label, tip, stops, value, onChange, format, note }: { label: string; tip?: string; stops: T[]; value: T; onChange: (v: T) => void; format: (v: T) => string; note: (v: T) => string }) {
  const index = Math.max(0, stops.indexOf(value))
  const pct = (index / (stops.length - 1)) * 100
  return (
    <fieldset className="cf-group cf-slide">
      <legend>
        {label}
        {tip ? <InfoTip text={tip} label={`About ${label}`} /> : null}
      </legend>
      <div className="cf-slide-top">
        <strong key={String(value)}>{format(value)}</strong>
        <span>{note(value)}</span>
      </div>
      <input
        type="range"
        className="cf-range"
        min={0}
        max={stops.length - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(stops[Number(e.target.value)]!)}
        aria-label={label}
        aria-valuetext={format(value)}
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
      />
      <div className="cf-ticks" aria-hidden>
        <span>{format(stops[0]!)}</span>
        <span>{format(stops[stops.length - 1]!)}</span>
      </div>
    </fieldset>
  )
}
