"use client"

import "@web/components/fantasy/fantasy-workspace.css"
import "@web/components/fantasy/season/fantasy-season.css"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarDays, ChevronDown, Crown, Trophy, Flag, HelpCircle, Pencil, Repeat } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { useConfirm } from "@web/components/ui/confirm"
import { useToast } from "@web/components/ui/toast"
import { revealStyle } from "@web/components/motion/reveal"
import { LeaguePageSkeleton } from "@web/components/skeletons"
import { Choice, Row } from "@web/components/fantasy/choice"
import { EditLeagueDialog } from "@web/components/fantasy/edit-league-dialog"
import { InviteButton } from "@web/components/fantasy/season/invite-button"
import { SeasonOptIn } from "@web/components/fantasy/season/opt-in"
import { DraftPicker } from "@web/components/fantasy/season/draft-picker"
import { RecapCard } from "@web/components/fantasy/season/recap-card"
import { Countdown, Cup, PersonRows, personName, useNow } from "@web/components/fantasy/season/season-parts"
import { formatDay, formatDeadline, formatPoints, formatRecord, ordinal, periodWord, roundProgress } from "@web/components/fantasy/season/season-format"
import { LeagueMark, watermark } from "@web/components/league/league-mark"
import { EmptyScene } from "@web/components/ui/empty-scene"
import { InfoTip } from "@web/components/ui/tip"
import { Delta } from "@web/components/ui/delta"
import { plural } from "@web/lib/plural"
import { liveRefreshMs } from "@web/lib/live-refresh"
import { mutate, useApi } from "@web/lib/use-api"
import { TROPHY_LABELS } from "@web/lib/fantasy-season"
import type { NoSeason, SeasonView } from "@web/lib/fantasy-season-view"

const LENGTHS = [
  { label: "4 rounds", value: 4 },
  { label: "8 rounds", value: 8 },
  { label: "12 rounds", value: 12 },
  { label: "Open-ended", value: null },
] as const

export default function SeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, error, loading, refetch } = useApi<SeasonView | NoSeason>(`/api/fantasy/${id}/season`, [], { refreshMs: liveRefreshMs(60_000) })
  const [editing, setEditing] = useState(false)
  const [seen, setSeen] = useState(true)
  useEffect(() => { try { setSeen(localStorage.getItem("fs-how-seen") === "1") } catch {} }, [])

  // Land on the section the strip linked to (#recap) once the content exists.
  useEffect(() => {
    if (data && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" })
  }, [data && "season" in data ? data.season.id : null]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <LeaguePageSkeleton />
  if (!data) return <p className="text-sm text-muted-foreground">{error ?? "Couldn't load this season."}</p>
  if ("none" in data) return <SeasonOptIn leagueId={id} league={data.league} nextStarts={data.nextStarts} onStarted={refetch} />

  const { league, season, current, draft, standings, rounds, headToHead, trophies, seasons, recap } = data
  const mine = standings.find((s) => s.isYou)
  const players = Math.min(Math.max(current?.rows.filter((r) => r.picked !== false).length || standings.length || draft?.players || 5, 2), 12)
  const ladder = Array.from({ length: players }, (_, i) => players - i)

  return (
    <div className="fw" data-accent={league.accent}>
      <Link href={season.mode === "draft" ? "/fantasy" : `/fantasy/${id}`} className="fw-back">
        <ArrowLeft className="size-3.5" aria-hidden /> {season.mode === "draft" ? "Fantasy leagues" : league.name}
      </Link>

      <header className="fw-head reveal" data-accent={league.accent} style={revealStyle(0)}>
        <div className="fw-identity">
          <span className="fw-art" data-accent={league.accent} aria-hidden>
            <LeagueMark value={league.emoji} accent={league.accent} size={42} />
          </span>
          <div>
            <span className="fw-eyebrow">{season.cadence === "weekly" ? "Weekly" : season.cadence === "monthly" ? "Monthly" : "Quarterly"} rounds / Season {season.number}</span>
            <h1>{league.name}</h1>
          </div>
        </div>
        <ul className="fw-meta" aria-label="Season rules">
          <li className="fw-meta-status">{season.state === "complete" ? "Complete" : season.state === "upcoming" ? `Starts ${formatDay(season.startsAt)}` : "In progress"}</li>
          <li>{season.roundCount ? `${season.roundCount} rounds` : "Open-ended"}</li>
          {(draft?.players ?? current?.rows.length ?? standings.length) > 0 ? <li>{plural(draft?.players ?? current?.rows.length ?? standings.length, "player")}</li> : null}
          {mine ? <li>You: {formatPoints(mine.points)} {mine.points === 1 ? "pt" : "pts"}</li> : null}
        </ul>
        {season.mode === "draft" ? (
          <div className="fw-actions">
            {league.isOwner && !league.isClosed ? (
              <button type="button" className="fw-btn" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                Edit league
              </button>
            ) : null}
            <InviteButton code={league.inviteCode} />
          </div>
        ) : null}
      </header>

      {season.mode === "draft" && league.isOwner && !league.isClosed ? (
        <EditLeagueDialog league={{ id, name: league.name, emoji: league.emoji, accent: league.accent, endsAt: league.endsAt }} open={editing} onClose={() => setEditing(false)} onSaved={refetch} />
      ) : null}

      <details className="fw-panel fs-how reveal" style={revealStyle(1)} open={standings.length === 0 || !seen} onToggle={(e) => { if (!e.currentTarget.open) { try { localStorage.setItem("fs-how-seen", "1") } catch {} setSeen(true) } }}>
        <summary>
          <HelpCircle aria-hidden />
          <span>How a season works</span>
          <ChevronDown className="fs-how-chev" aria-hidden />
        </summary>
        <div className="fs-how-body">
          <ol className="fs-rail">
            <li><span><CalendarDays aria-hidden /></span><b>{season.cadence === "weekly" ? "Monday" : "New round"}</b><small>New {periodWord(season.cadence)}, fresh scoreboard</small></li>
            <li><span><Repeat aria-hidden /></span><b>All {periodWord(season.cadence)}</b><small>Trade live like normal</small></li>
            <li><span><Flag aria-hidden /></span><b>{formatDeadline(current?.endsAt ?? season.startsAt).split(" ")[0]} {new Date(current?.endsAt ?? season.startsAt).toLocaleTimeString("en-US", { hour: "numeric" })}</b><small>Round closes, ranked on the {periodWord(season.cadence)}</small></li>
            <li><span><Trophy aria-hidden /></span><b>Points</b><small>Rank becomes points</small></li>
          </ol>
          <div className="fs-ladder" aria-label="Points for each place">
            <p>Points this round ({players} players)</p>
            <div>
              {ladder.map((pts, i) => (
                <span key={i} data-place={i + 1}>
                  <b>{ordinal(i + 1)}</b>
                  <em>{pts}</em>
                </span>
              ))}
            </div>
            <small>Most points wins the season. Level on points? Combined round return decides.</small>
          </div>
        </div>
      </details>

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

          {current ? <RoundBoard leagueId={id} current={current} season={season} emoji={league.emoji} onChanged={refetch} /> : null}

          {!current && !draft && season.state === "running" ? (
            <section className="fw-panel reveal" style={revealStyle(1)}>
              <div className="fw-section-head">
                <h2>Between rounds</h2>
              </div>
              <p className="fs-empty">The last round has closed. We are waiting for the final prices, then points are awarded (usually within a day).</p>
            </section>
          ) : null}

          {season.state === "upcoming" && !draft ? (
            <section className="fw-panel reveal" style={revealStyle(1)}>
              <div className="fw-section-head">
                <h2>Round 1 starts {formatDay(season.startsAt)}</h2>
                <p>{season.cadence === "weekly" ? "Weekly, from Monday" : season.cadence === "monthly" ? "Monthly rounds" : "Quarterly rounds"}</p>
              </div>
              <p className="fs-empty">
                <strong>{season.cadence === "weekly" ? "Weekly rounds, every Monday." : `One round every ${periodWord(season.cadence)}.`}</strong>
                Each round ranks everyone by how their portfolio moves over the {periodWord(season.cadence)}. Trade as usual: no sign-up needed.
              </p>
            </section>
          ) : null}

          <section className="fw-panel fs-after reveal" style={revealStyle(2)} aria-labelledby="fs-table-title">
            <div className="fw-section-head">
              <h2 id="fs-table-title">Season standings<InfoTip text="Each round you are ranked against everyone. 1st earns one point per player, last earns one. Ties split the points." label="How points work" /></h2>
              <p>Most points wins. Ties: combined round return.</p>
            </div>
            {standings.length === 0 ? (
              <p className="fs-empty">
                <strong>No points yet.</strong>
                Points land when Round 1 closes. 1st earns one point per player, last earns one, and ties split the points.
              </p>
            ) : (
              <>
              {standings.length >= 3 && standings.some((s) => s.rank !== 1) ? (
                <div className="fs-podium" aria-label="Top three">
                  {[1, 0, 2].map((i) => {
                    const s = standings[i]!
                    return (
                      <div key={s.userId} className="fs-step" data-place={i + 1} data-you={s.isYou || undefined}>
                        <div className="fs-step-who">
                          {i === 0 ? <Crown className="fs-crown" aria-hidden /> : null}
                          <span className="fs-step-av"><Avatar src={s.image} name={s.name} handle={s.handle} size="lg" /></span>
                          <b>{personName(s)}</b>
                          <span className="fs-step-pts numeric">{formatPoints(s.points)}<small>{s.points === 1 ? "pt" : "pts"}</small></span>
                          <span className="fs-step-ret"><Delta value={s.compounded} size="sm" variant="plain" /></span>
                        </div>
                        <div className="fs-step-block"><span aria-hidden>{i + 1}</span></div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
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
                      <strong style={{ fontWeight: 500 }} className="numeric">{formatPoints(s.points)} {s.points === 1 ? "pt" : "pts"}</strong>
                      <small className="numeric">
                        <Delta value={s.compounded} size="sm" variant="plain" /> total
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
              </>
            )}
          </section>

          <section className="fw-panel fs-after reveal" data-flat style={revealStyle(3)} aria-labelledby="fs-rounds-title">
            <div className="fw-section-head">
              <h2 id="fs-rounds-title">Rounds</h2>
              <p>{rounds.length === 0 ? "None settled" : `${rounds.length} settled`}</p>
            </div>
            {rounds.length === 0 ? <p className="fs-empty">Finished rounds are kept here, with the full table and every pick.</p> : <RoundArchive leagueId={id} rounds={rounds} onChanged={refetch} />}
          </section>
        </div>

        <aside className="fw-rail reveal" style={revealStyle(2)}>
          <section className="fw-panel fs-last" aria-labelledby="fs-trophy-title">
            <div className="fw-section-head">
              <h2 id="fs-trophy-title">Trophies</h2>
              <p>This league</p>
            </div>
            {trophies.length === 0 ? (
              <EmptyScene kind="trophies" title="The shelf is empty" body="Win a round to put the first cup on it." />
            ) : (
              <TrophyCase trophies={trophies} standings={standings} />
            )}
          </section>

          {headToHead.length > 0 ? (
            <section className="fw-panel fs-last" data-flat aria-labelledby="fs-h2h-title">
              <div className="fw-section-head">
                <h2 id="fs-h2h-title">Head to head<InfoTip text="Each closed round, the higher finisher gets a win. 2-1 means you beat them twice and lost once." label="How records work" /></h2>
                <p>You vs each player</p>
              </div>
              <p className="fs-vs-note">Each closed round, whoever ranked higher gets a win. Green means you are ahead.</p>
              <div className="fs-vs">
                {headToHead.map((h) => {
                  const total = h.wins + h.losses + h.ties
                  return (
                    <div key={h.opponent.userId} className="fs-vs-row">
                      <span className="fs-h2h-who">
                        <Avatar src={h.opponent.image} name={h.opponent.name} handle={h.opponent.handle} size="sm" />
                        <span>{personName(h.opponent)}</span>
                      </span>
                      <span className="fs-record">
                        <b data-lead={h.wins > h.losses ? "up" : h.wins < h.losses ? "down" : undefined}>
                          {h.wins > h.losses ? "You lead " : h.wins < h.losses ? "They lead " : "Level "}
                          {formatRecord(h)}
                        </b>
                      </span>
                      {total > 0 ? (
                        <span className="fs-vs-bar" aria-hidden>
                          <i data-k="w" style={{ width: `${(h.wins / total) * 100}%` }} />
                          <i data-k="t" style={{ width: `${(h.ties / total) * 100}%` }} />
                          <i data-k="l" style={{ width: `${(h.losses / total) * 100}%` }} />
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}

          {recap ? (
            <div id="recap" className="fs-recap-slot" style={{ scrollMarginTop: 72 }}>
              <RecapCard recap={recap} token={recap.token} accent={league.accent} leagueId={id} isOwner={league.isOwner} onSharingChanged={refetch} />
            </div>
          ) : null}

          {seasons.length > 1 ? (
            <section className="fw-panel fs-last" aria-labelledby="fs-seasons-title">
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
function RoundBoard({ leagueId, current, season, emoji, onChanged }: { leagueId: string; current: NonNullable<SeasonView["current"]>; season: SeasonView["season"]; emoji: string; onChanged: () => void }) {
  const now = useNow()
  const progress = roundProgress(current.startsAt, current.endsAt, now)
  const ranked = current.rows.filter((r) => r.picked !== false)
  return (
    <section className="fw-panel fs-hero reveal" data-emoji={watermark(emoji)} style={revealStyle(1)} aria-labelledby="fs-round-title">
      <div className="fs-hero-top">
        <div>
          <span className="fs-live"><i aria-hidden />Live</span>
          <h2 id="fs-round-title" className="fs-hero-title">
            Round {current.number}
            {season.roundCount ? <span style={{ color: "var(--fw-fg3)" }}> / {season.roundCount}</span> : null}
          </h2>
          <p className="fs-hero-sub">{season.mode === "draft" ? "Picks locked / scored on equal weight" : "Portfolio return since the start of the week"}</p>
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
            <div className="fs-archive-wrap" data-open={expanded || undefined}>
              <div className="fs-archive-body">
                {expanded ? (
                  <>
                    {r.late ? <p className="fs-late">Settled on the latest prices on file: a nightly update was missing.</p> : null}
                    <PersonRows rows={r.table} leagueId={leagueId} onChanged={onChanged} />
                  </>
                ) : null}
              </div>
            </div>
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
  const [length, setLength] = useState<number | null>(season.roundCount)
  const picks = season.picksPerRound ?? 5
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
    <section className="fw-panel fs-last" aria-labelledby="fs-owner-title">
      <div className="fw-section-head">
        <h2 id="fs-owner-title">{canStartNext ? "Next season" : "Season controls"}</h2>
        <p>Owner</p>
      </div>
      <div className="fs-owner">
        {canStartNext ? (
          <>
            <p>Start Season {season.number + 1} with the same friends. The standings start from zero; earlier trophies stay on the shelf.</p>
            <div className="fs-stack">
              <button type="button" className="fw-btn" data-solid disabled={busy} onClick={() => start({ mode: season.mode, rounds: season.roundCount, picks: season.picksPerRound ?? 5 })}>
                <Repeat aria-hidden /> Next season: {season.roundCount ? `${season.roundCount} rounds` : "open-ended"}
              </button>
              <button type="button" className="fw-btn" aria-expanded={custom} onClick={() => setCustom(!custom)}>
                Change the length
              </button>
            </div>
            {custom ? (
              <div className="fs-form animate-rise-in">
                <Row label="Length">
                  {LENGTHS.map((l) => (
                    <Choice key={l.label} active={length === l.value} onClick={() => setLength(l.value)}>
                      {l.label}
                    </Choice>
                  ))}
                </Row>
                <button type="button" className="fw-btn" data-solid disabled={busy} onClick={() => start({ mode: season.mode, rounds: length, picks })}>
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

function TrophyCase({ trophies, standings }: { trophies: SeasonView["trophies"]; standings: SeasonView["standings"] }) {
  const by = new Map<string, SeasonView["trophies"]>()
  for (const t of trophies) by.set(t.userId, [...(by.get(t.userId) ?? []), t])
  const people = [...by.entries()]
    .map(([userId, list]) => ({ userId, list, person: standings.find((s) => s.userId === userId) }))
    .sort((a, b) => b.list.length - a.list.length)
  return (
    <div className="fs-case">
      {people.map(({ userId, list, person }) => (
        <div key={userId} className="fs-shelf" data-you={person?.isYou || undefined}>
          <div className="fs-shelf-who">
            {person ? <Avatar src={person.image} name={person.name} handle={person.handle} size="sm" /> : null}
            <b>{person ? personName(person) : list[0]?.name?.split(" ")[0] ?? "Player"}</b>
            <small>{list.length} {list.length === 1 ? "trophy" : "trophies"}</small>
          </div>
          <div className="fs-shelf-row">
            {list.slice(0, 12).map((t, i) => (
              <Cup key={`${t.kind}-${t.seasonNumber}-${t.roundNumber}-${i}`} index={i} kind={t.kind} label={t.roundNumber ? `R${t.roundNumber}` : `S${t.seasonNumber}`} title={`${TROPHY_LABELS[t.kind]?.label ?? t.kind}, season ${t.seasonNumber}${t.roundNumber ? `, round ${t.roundNumber}` : ""}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
