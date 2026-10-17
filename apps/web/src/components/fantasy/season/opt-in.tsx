"use client"

import "@web/components/fantasy/fantasy-workspace.css"
import "@web/components/fantasy/season/fantasy-season.css"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Choice, Row } from "@web/components/fantasy/choice"
import { SeasonFormatRow } from "@web/components/fantasy/season/list-parts"
import { useToast } from "@web/components/ui/toast"
import { mutate } from "@web/lib/use-api"

const LENGTHS = [
  { label: "4 rounds", value: 4 },
  { label: "8 rounds", value: 8 },
  { label: "Open-ended", value: null },
] as const

/**
 * A league that never turned weekly rounds on. Nothing about it changes until its owner
 * does: the league page works as it always has.
 */
export function SeasonOptIn({ leagueId, league, onStarted }: { leagueId: string; league: { name: string; emoji: string; accent: string; isOwner: boolean; isClosed: boolean }; onStarted: () => void }) {
  const { toast } = useToast()
  const [format, setFormat] = useState<{ mode: "trading" | "draft"; picks: number }>({ mode: "trading", picks: 5 })
  const [length, setLength] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  async function start() {
    setBusy(true)
    try {
      await mutate(`/api/fantasy/${leagueId}/season`, { body: { action: "next", mode: format.mode, rounds: length, picks: format.picks } })
      toast("Weekly rounds are on.", "success")
      onStarted()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't turn on weekly rounds.", "error")
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
            <span className="fw-eyebrow">Fantasy / Weekly rounds</span>
            <h1>Win the week</h1>
          </div>
        </div>
      </header>
      <section className="fw-panel" style={{ padding: "0 var(--fw-ins) 8px", maxWidth: 560 }}>
        <div className="fw-section-head">
          <h2>Weekly rounds</h2>
          <p>Optional</p>
        </div>
        {league.isOwner && !league.isClosed ? (
          <div className="fs-form">
            <p className="fs-hint" style={{ marginTop: 0 }}>
              A new round every Monday: everyone is ranked, the week has a winner and a recap, and a season crowns a champion. Your league keeps working exactly as it does now; nothing is reset.
            </p>
            <SeasonFormatRow mode={format.mode} picks={format.picks} onChange={setFormat} />
            <Row label="Length">
              {LENGTHS.map((l) => (
                <Choice key={l.label} active={length === l.value} onClick={() => setLength(l.value)}>
                  {l.label}
                </Choice>
              ))}
            </Row>
            <button type="button" className="fw-btn" data-solid disabled={busy} onClick={start} style={{ alignSelf: "flex-start" }}>
              Turn on weekly rounds
            </button>
          </div>
        ) : (
          <p className="fs-empty">
            <strong>Not turned on.</strong>
            {league.isClosed ? "This league has finished." : "The owner can add weekly rounds, a season table and recaps to this league."}
          </p>
        )}
      </section>
    </div>
  )
}
