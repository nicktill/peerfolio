"use client"

import "@web/components/fantasy/fantasy-workspace.css"
import "@web/components/fantasy/season/fantasy-season.css"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Choice, Row } from "@web/components/fantasy/choice"
import { periodWord } from "@web/components/fantasy/season/season-format"
import { InfoTip } from "@web/components/ui/tip"
import { useToast } from "@web/components/ui/toast"
import { boundaryOnOrAfter, type Cadence } from "@web/lib/fantasy-season"
import { mutate } from "@web/lib/use-api"

const LENGTHS = [
  { label: "4 rounds", value: 4 },
  { label: "8 rounds", value: 8 },
  { label: "12 rounds", value: 12 },
  { label: "Open-ended", value: null },
] as const

const CADENCES: { value: Cadence; label: string; tip: string }[] = [
  { value: "weekly", label: "Weekly", tip: "A new round every Monday. Ranked on that week's return." },
  { value: "monthly", label: "Monthly", tip: "A new round on the 1st of each month. Ranked on that month's return." },
  { value: "quarterly", label: "Quarterly", tip: "A new round on Jan 1, Apr 1, Jul 1 and Oct 1. Ranked on that quarter's return." },
]

const day = (d: Date) => d.toISOString().slice(0, 10)
const label = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })

/**
 * A league that never turned seasons on. Nothing about it changes until its owner does:
 * the league page works as it always has, and the long race is never touched.
 */
export function SeasonOptIn({ leagueId, league, nextStarts, onStarted }: { leagueId: string; league: { name: string; emoji: string; accent: string; isOwner: boolean; isClosed: boolean }; nextStarts: Record<Cadence, string>; onStarted: () => void }) {
  const { toast } = useToast()
  const [cadence, setCadence] = useState<Cadence>("weekly")
  const [length, setLength] = useState<number | null>(null)
  // The date as typed; empty means "the next one". What actually starts is that date snapped forward to a boundary.
  const [picked, setPicked] = useState("")
  const [busy, setBusy] = useState(false)

  const today = new Date(`${day(new Date())}T00:00:00Z`)
  const startsAt = picked ? boundaryOnOrAfter(new Date(`${picked}T00:00:00Z`), cadence) : new Date(nextStarts[cadence])
  const word = periodWord(cadence)

  async function start() {
    setBusy(true)
    try {
      await mutate(`/api/fantasy/${leagueId}/season`, { body: { action: "enable", cadence, startsAt: startsAt.toISOString(), rounds: length } })
      toast("Seasons are on.", "success")
      onStarted()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't turn on seasons.", "error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fw">
      <Link href={`/fantasy/${leagueId}`} className="fw-back">
        <ArrowLeft className="size-3.5" aria-hidden /> {league.name}
      </Link>
      <header className="fw-head" data-accent={league.accent}>
        <div className="fw-identity">
          <span className="fw-art" data-accent={league.accent} aria-hidden>
            <span>{league.emoji}</span>
          </span>
          <div>
            <span className="fw-eyebrow">Fantasy / Seasons</span>
            <h1>Turn on seasons</h1>
          </div>
        </div>
      </header>
      <section className="fw-panel" style={{ padding: "0 var(--fw-ins) 8px", maxWidth: 560 }}>
        <div className="fw-section-head">
          <h2>Seasons</h2>
          <p>Optional</p>
        </div>
        {league.isOwner && !league.isClosed ? (
          <div className="fs-form">
            <p className="fs-hint" style={{ marginTop: 0 }}>
              Your league keeps its long-race standings. Seasons add a second scoreboard in rounds: each round ranks everyone on that {word}&apos;s return, gets a winner and a recap, and points build a season table. Trades, positions and rankings so far stay as they are.
            </p>
            <Row label="Round length">
              {CADENCES.map((c) => (
                <Choice key={c.value} active={cadence === c.value} onClick={() => setCadence(c.value)}>
                  {c.label}
                </Choice>
              ))}
            </Row>
            <p className="fs-hint">
              {CADENCES.find((c) => c.value === cadence)!.tip}
              <InfoTip label="About round length" text="Weekly, monthly and quarterly rounds all follow UTC calendar dates, so clock changes never move a round. A longer round means fewer, bigger swings." />
            </p>
            <Row label="Starts">
              <Choice active={!picked} onClick={() => setPicked("")}>
                Next {word}
              </Choice>
              <label className="fw-choice" data-active={picked ? "true" : undefined} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <span>Pick a date</span>
                <input type="date" value={picked} min={day(today)} onChange={(e) => setPicked(e.target.value)} aria-label="Start date" />
              </label>
            </Row>
            <p className="fs-hint">
              Round 1 starts <b>{label(startsAt)}</b>.
              <InfoTip label="About the start date" text={`Rounds begin on a ${word} boundary, so a date you pick moves forward to the next one. Until then the league runs as it does today, and Round 1 only counts what happens from the start.`} />
            </p>
            <Row label="Length">
              {LENGTHS.map((l) => (
                <Choice key={l.label} active={length === l.value} onClick={() => setLength(l.value)}>
                  {l.label}
                </Choice>
              ))}
            </Row>
            <p className="fs-hint">Open-ended runs until you wrap it up from the season page.</p>
            <button type="button" className="fw-btn" data-solid disabled={busy} onClick={start} style={{ alignSelf: "flex-start" }}>
              Turn on seasons
            </button>
          </div>
        ) : (
          <p className="fs-empty">
            <strong>Not turned on.</strong>
            {league.isClosed ? "This league has finished." : "The owner can add seasons, a season table and recaps to this league."}
          </p>
        )}
      </section>
    </div>
  )
}
