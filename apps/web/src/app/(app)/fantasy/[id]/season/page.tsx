"use client"

import "@web/components/fantasy/fantasy-workspace.css"
import "@web/components/fantasy/season/fantasy-season.css"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronDown, Flag, Repeat } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { useConfirm } from "@web/components/ui/confirm"
import { useToast } from "@web/components/ui/toast"
import { revealStyle } from "@web/components/motion/reveal"
import { LeaguePageSkeleton } from "@web/components/skeletons"
import { Choice, Row } from "@web/components/fantasy/choice"
import { DraftPicker } from "@web/components/fantasy/season/draft-picker"
import { RecapCard } from "@web/components/fantasy/season/recap-card"
import { Countdown, PersonRows, TrophyChip, personName, useNow } from "@web/components/fantasy/season/season-parts"
import { describeSeason, formatDay, formatDeadline, formatPoints, formatRecord, roundProgress } from "@web/components/fantasy/season/season-format"
import { Delta } from "@web/components/ui/delta"
import { plural } from "@web/lib/plural"
import { liveRefreshMs } from "@web/lib/live-refresh"
import { mutate, useApi } from "@web/lib/use-api"
import type { SeasonView } from "@web/lib/fantasy-season-view"

const LENGTHS = [
  { label: "4 rounds", value: 4 },
  { label: "8 rounds", value: 8 },
  { label: "12 rounds", value: 12 },
  { label: "Open-ended", value: null },
] as const

export default function SeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, error, loading, refetch } = useApi<SeasonView>(`/api/fantasy/${id}/season`, [], { refreshMs: liveRefreshMs(60_000) })

  // Land on the section the strip linked to (#recap) once the content exists.
  useEffect(() => {
    if (data && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" })
  }, [data?.season.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <LeaguePageSkeleton />
  if (!data) return <p className="text-sm text-muted-foreground">{error ?? "Couldn't load this season."}</p>

  const { league, season, current, draft, standings, rounds, headToHead, trophies, seasons, recap } = data
  const mine = standings.find((s) => s.isYou)

  return (
    <div className="fw">
      <Link href={`/fantasy/${id}`} className="fw-back">
        <ArrowLeft className="size-3.5" aria-hidden /> {league.name}
      </Link>

      <header className="fw-head reveal" data-accent={league.accent} style={revealStyle(0)}>
        <div className="fw-identity">
          <span className="fw-art" data-accent={league.accent} aria-hidden>
            <span>{league.emoji}</span>
          </span>
          <div>
            <span className="fw-eyebrow">Fantasy / Season</span>
            <h1>Season {season.number}</h1>
          </div>
        </div>
        <ul className="fw-meta" aria-label="Season rules">
          <li className="fw-meta-status">{season.state === "complete" ? "Complete" : season.state === "upcoming" ? `Starts ${formatDay(season.startsAt)}` : "In progress"}</li>
          <li>{describeSeason(season)}</li>
          <li>{plural(draft?.players ?? current?.rows.length ?? standings.length, "player")}</li>
          {mine ? <li>You: {formatPoints(mine.points)} pts</li> : null}
        </ul>
      </header>

      <div className="fw-grid">
        <div className="fw-main">
          {draft ? (
            <section className="fw-panel reveal" style={revealStyle(1)} aria-labelledby="fs-draft-title">
              <div className="fw-section-head">
                <h2 id="fs-draft-title">Round {draft.number} draft</h2>
                <p>{draft.open ? `Locks ${formatDeadline(draft.deadline)}` : "Locked"}</p>
              </div>
              <DraftPicker key={`${draft.roundId}:${draft.yours.map((p) => p.ticker).join()}`} leagueId={id} draft={draft} onSaved={refetch} />
            </section>
          ) : null}

          {current ? <RoundBoard leagueId={id} current={current} season={season} accent={league.accent} onChanged={refetch} /> : null}

          {!current && !draft && season.state === "running" ? (
            <section className="fw-panel reveal" style={revealStyle(1)}>
              <div className="fw-section-head">
                <h2>Between rounds</h2>
              </div>
              <p className="fs-empty">The next round opens on Monday. Standings below are from the rounds already played.</p>
            </section>
          ) : null}

          {season.state === "upcoming" && !draft ? (
            <section className="fw-panel reveal" style={revealStyle(1)}>
              <div className="fw-section-head">
                <h2>Round 1 starts {formatDay(season.startsAt)}</h2>
                <p>Mon 00:00 UTC</p>
              </div>
              <p className="fs-empty">
                <strong>Weekly rounds, every Monday.</strong>
                Each round ranks everyone by how their portfolio moves that week. Trade as usual: no sign-up needed.
              </p>
            </section>
          ) : null}

          <section className="fw-panel reveal" style={revealStyle(2)} aria-labelledby="fs-table-title">
            <div className="fw-section-head">
              <h2 id="fs-table-title">Season standings</h2>
              <p>Points, then total return</p>
            </div>
            {standings.length === 0 ? (
              <p className="fs-empty">
                <strong>Nothing settled yet.</strong>
                When a round ends, everyone is ranked on its return. First place earns one point per player, last earns one, and ties split the points. The table fills in here.
              </p>
            ) : (
              <ul className="fs-rows">
                {standings.map((s) => (
                  <li key={s.userId} className="fs-row" data-you={s.isYou || undefined}>
                    <span className="fs-rank" data-rank={s.rank}>{s.rank}</span>
                    <Avatar src={s.image} name={s.name} handle={s.handle} size="md" />
                    <div className="fs-who">
                      <strong>
                        <span>{personName(s)}</span>
                        {s.isYou ? <span className="fw-you-tag">you</span> : null}
                      </strong>
                      <small>
                        {plural(s.wins, "win")} / {plural(s.rounds, "round")} played
                      </small>
                    </div>
                    <div className="fs-figure">
                      <strong style={{ fontWeight: 500 }} className="numeric">{formatPoints(s.points)} pts</strong>
                      <small className="numeric">
                        <Delta value={s.compounded} size="sm" variant="plain" /> total
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="fw-panel reveal" style={revealStyle(3)} aria-labelledby="fs-rounds-title">
            <div className="fw-section-head">
              <h2 id="fs-rounds-title">Rounds</h2>
              <p>{rounds.length === 0 ? "None settled" : `${rounds.length} settled`}</p>
            </div>
            {rounds.length === 0 ? <p className="fs-empty">Finished rounds are kept here, with the full table and every pick.</p> : <RoundArchive leagueId={id} rounds={rounds} onChanged={refetch} />}
          </section>
        </div>

        <aside className="fw-rail reveal" style={revealStyle(2)}>
          {recap ? (
            <div id="recap" style={{ order: -1, scrollMarginTop: 72 }}>
              <RecapCard recap={recap} token={recap.token} accent={league.accent} />
            </div>
          ) : null}

          <section className="fw-panel" aria-labelledby="fs-trophy-title">
            <div className="fw-section-head">
              <h2 id="fs-trophy-title">Trophies</h2>
              <p>This league</p>
            </div>
            {trophies.length === 0 ? (
              <p className="fs-empty">Win a round to put the first one on the shelf.</p>
            ) : (
              <ul className="fs-trophies">
                {trophies.slice(0, 24).map((t, i) => (
                  <TrophyChip key={`${t.userId}-${t.kind}-${t.seasonNumber}-${t.roundNumber}-${i}`} kind={t.kind} detail={`${t.name?.split(" ")[0] ?? "Player"} / S${t.seasonNumber}${t.roundNumber ? ` R${t.roundNumber}` : ""}`} />
                ))}
              </ul>
            )}
          </section>

          {headToHead.length > 0 ? (
            <section className="fw-panel" aria-labelledby="fs-h2h-title">
              <div className="fw-section-head">
                <h2 id="fs-h2h-title">Head to head</h2>
                <p>You vs each player</p>
              </div>
              <div>
                {headToHead.map((h) => (
                  <div key={h.opponent.userId} className="fs-h2h">
                    <span className="fs-h2h-who">
                      <Avatar src={h.opponent.image} name={h.opponent.name} handle={h.opponent.handle} size="sm" />
                      <span>{personName(h.opponent)}</span>
                    </span>
                    <span className="fs-record">
                      <b data-lead={h.wins > h.losses ? "up" : h.wins < h.losses ? "down" : undefined}>{formatRecord(h)}</b>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {seasons.length > 1 ? (
            <section className="fw-panel" aria-labelledby="fs-seasons-title">
              <div className="fw-section-head">
                <h2 id="fs-seasons-title">Past seasons</h2>
              </div>
              <ul className="fs-seasons">
                {seasons.map((s) => (
                  <li key={s.number}>
                    <span>Season {s.number}</span>
                    <small>{s.status === "complete" ? (s.champions.length ? `Won by ${s.champions.join(" and ")}` : "No winner") : "Running"}</small>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {league.isOwner ? <OwnerControls leagueId={id} data={data} onChanged={refetch} /> : null}
        </aside>
      </div>
    </div>
  )
}

/** The round in progress with live standings. */
function RoundBoard({ leagueId, current, season, accent, onChanged }: { leagueId: string; current: NonNullable<SeasonView["current"]>; season: SeasonView["season"]; accent: string; onChanged: () => void }) {
  const now = useNow()
  const progress = roundProgress(current.startsAt, current.endsAt, now)
  const ranked = current.rows.filter((r) => r.picked !== false)
  return (
    <section className="fw-panel fs-hero fs-accent reveal" data-accent={accent} style={revealStyle(1)} aria-labelledby="fs-round-title">
      <div className="fs-hero-top">
        <div>
          <span className="fw-eyebrow">{season.mode === "draft" ? "Draft round" : "Live round"}</span>
          <h2 id="fs-round-title" className="fs-hero-title">
            Round {current.number}
            {season.roundCount ? <span style={{ color: "var(--fw-fg3)" }}> / {season.roundCount}</span> : null}
          </h2>
          <p className="fs-hero-sub">{season.mode === "draft" ? "Picks locked / scored on equal weight" : "Portfolio return since Friday's close"}</p>
        </div>
        <div className="fs-clock">
          <strong>
            <Countdown to={current.endsAt} />
          </strong>
          <span>to close</span>
        </div>
      </div>
      <div className="fs-progress" role="progressbar" aria-label="Round progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <i style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="fs-hero-body">
        {ranked.length === 0 && current.rows.length === 0 ? (
          <p className="fs-empty">Nobody is in this round yet.</p>
        ) : (
          <PersonRows rows={current.rows} leagueId={leagueId} onChanged={onChanged} />
        )}
      </div>
    </section>
  )
}

function RoundArchive({ leagueId, rounds, onChanged }: { leagueId: string; rounds: SeasonView["rounds"]; onChanged: () => void }) {
  const [open, setOpen] = useState<number | null>(rounds[0]?.number ?? null)
  return (
    <ul className="fs-archive">
      {rounds.map((r) => {
        const winner = r.table.find((t) => r.winners.includes(t.userId))
        const expanded = open === r.number
        return (
          <li key={r.number}>
            <button type="button" className="fs-archive-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r.number)}>
              <span className="fs-archive-n">R{r.number}</span>
              <span className="fs-archive-win">
                {r.winners.length === 0 ? "No result" : r.winners.length > 1 ? `${r.winners.length} way tie` : (winner ? personName(winner) : "Winner")}
                <small>
                  {formatDay(r.startsAt)} / {plural(r.players, "player")}
                </small>
              </span>
              <span className="fs-archive-you">{r.yourRank ? `You: ${r.yourRank}/${r.players}` : "Sat out"}</span>
              <ChevronDown aria-hidden />
            </button>
            {expanded ? (
              <div className="fs-archive-body animate-rise-in">
                {r.late ? <p className="fs-late">Settled on the latest prices on file: a nightly update was missing.</p> : null}
                <PersonRows rows={r.table} leagueId={leagueId} onChanged={onChanged} />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function OwnerControls({ leagueId, data, onChanged }: { leagueId: string; data: SeasonView; onChanged: () => void }) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { season, canStartNext, league } = data
  const [custom, setCustom] = useState(false)
  const [mode, setMode] = useState<"trading" | "draft">(season.mode)
  const [length, setLength] = useState<number | null>(season.roundCount)
  const [picks, setPicks] = useState(season.picksPerRound ?? 5)
  const [busy, setBusy] = useState(false)

  async function start(body: Record<string, unknown>) {
    setBusy(true)
    try {
      await mutate(`/api/fantasy/${leagueId}/season`, { body: { action: "next", ...body } })
      toast("New season scheduled. Same friends, fresh table.", "success")
      setCustom(false)
      onChanged()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't start the season.", "error")
    } finally {
      setBusy(false)
    }
  }

  async function wrap() {
    const ok = await confirm({
      title: "Wrap up this season?",
      description: "The round in progress is the last one. Then the season is scored and trophies are given out.",
      confirmLabel: "Wrap up",
    })
    if (!ok) return
    setBusy(true)
    try {
      await mutate(`/api/fantasy/${leagueId}/season`, { body: { action: "wrap" } })
      onChanged()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't wrap up the season.", "error")
    } finally {
      setBusy(false)
    }
  }

  if (league.isClosed) return null
  if (!canStartNext && season.status === "complete") return null

  return (
    <section className="fw-panel" aria-labelledby="fs-owner-title">
      <div className="fw-section-head">
        <h2 id="fs-owner-title">{canStartNext ? "Run it back" : "Season controls"}</h2>
        <p>Owner</p>
      </div>
      <div className="fs-owner">
        {canStartNext ? (
          <>
            <p>Start Season {season.number + 1} with the same friends. Everyone begins level; trophies and records carry on.</p>
            <div className="fs-stack">
              <button type="button" className="fw-btn" data-solid disabled={busy} onClick={() => start({ mode: season.mode, rounds: season.roundCount, picks: season.picksPerRound ?? 5 })}>
                <Repeat aria-hidden /> Rematch: {describeSeason(season)}
              </button>
              <button type="button" className="fw-btn" aria-expanded={custom} onClick={() => setCustom(!custom)}>
                Change the format
              </button>
            </div>
            {custom ? (
              <div className="fs-form animate-rise-in">
                <Row label="Format">
                  <Choice active={mode === "trading"} onClick={() => setMode("trading")}>Trading</Choice>
                  <Choice active={mode === "draft"} onClick={() => setMode("draft")}>Weekly draft</Choice>
                </Row>
                <p className="fs-hint">{mode === "draft" ? "Everyone picks stocks before Sunday night. Equal weight, scored Friday to Friday." : "Trade as normal. Each week ranks portfolio returns."}</p>
                <Row label="Length">
                  {LENGTHS.map((l) => (
                    <Choice key={l.label} active={length === l.value} onClick={() => setLength(l.value)}>
                      {l.label}
                    </Choice>
                  ))}
                </Row>
                {mode === "draft" ? (
                  <Row label="Picks per round">
                    {[3, 5, 8].map((p) => (
                      <Choice key={p} active={picks === p} onClick={() => setPicks(p)}>
                        {p}
                      </Choice>
                    ))}
                  </Row>
                ) : null}
                <button type="button" className="fw-btn" data-solid disabled={busy} onClick={() => start({ mode, rounds: length, picks })}>
                  Start Season {season.number + 1}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p>{season.roundCount === null ? "This season runs until you end it." : `This season runs ${plural(season.roundCount, "round")}.`} Ending it makes the current round the last.</p>
            <button type="button" className="fw-btn" disabled={busy} onClick={wrap}>
              <Flag aria-hidden /> Wrap up after this round
            </button>
          </>
        )}
      </div>
    </section>
  )
}
