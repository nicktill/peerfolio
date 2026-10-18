"use client"

import { sportsInviteLink } from "@web/components/fantasy/sports-invite-link"
import "@web/components/fantasy/fantasy-workspace.css"
import "@web/components/sports/sports-workspace.css"

import { use, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUp, ArrowDown, CalendarDays, Check, ChevronDown, Link2, Lock, Radio, Search, X } from "lucide-react"
import { Choice } from "@web/components/fantasy/choice"
import { timeLeft } from "@web/components/fantasy/time-left"
import { LivePickSlip, type LivePickSelection } from "@web/components/sports/live-pick-panel"
import { SheetHandle } from "@web/components/sports/sheet-handle"
import { ManageSlip, type ManageTarget } from "@web/components/sports/manage-slip"
import { SlipPickCard } from "@web/components/sports/slip-pick-card"
import { SlipEmpty } from "@web/components/sports/slip-empty"
import { ScoreboardGames } from "@web/components/sports/scoreboard-games"
import { mergeLiveScores, scoreboardMatch, type ScoreGame } from "@web/lib/sports/scoreboard"
import { GameStatusChip, statusInputFromGame } from "@web/components/sports/game-status-chip"
import { PickLimitsButton } from "@web/components/sports/pick-limits-dialog"
import { matchupColors, marketSelectionColor } from "@web/lib/sports/matchup-colors"
import { LeagueBrand } from "@web/components/sports/league-brand"
import { revealStyle } from "@web/components/motion/reveal"
import { LeaguePageSkeleton } from "@web/components/skeletons"
import { useToast } from "@web/components/ui/toast"
import { useFantasyMode } from "@web/components/sports/mode-switch"
import { eventTitle, formatCredits, formatOdds, lineLabel, lockLabel, marketTitle, pickSentence, sideTeam, SPORT_LABEL, winOn100, type DisplayLine, type DisplayMarket } from "@web/lib/sports/format"
import { americanToDecimal } from "@web/lib/sports/odds"
import { onColor, oddsLabel, teamLook } from "@web/lib/sports/teams"
import { InfoTip } from "@web/components/ui/tip"
import { parlayStatRows, LeagueHero, LeaguePulse, Leaderboard, NextGames, PickFeed } from "@web/components/sports/league-parts"
import { LiveNumber } from "@web/components/sports/live-delta"
import { PickLockEffect, type PickLockFx } from "@web/components/sports/pick-lock-effect"
import { PlayerBadge, TeamBadge } from "@web/components/sports/team-badge"
import { ParlayIdsContext, ParlayModeBar, ParlaySlip, useParlay } from "@web/components/sports/parlay-slip"
import { stackParlays, type ParlayLimits, type ParlayRow } from "@web/components/sports/parlay-types"
import { plural } from "@web/lib/plural"
import { matchesSearch } from "@web/lib/sports/search"
import { mutate, useApi } from "@web/lib/use-api"

type Line = DisplayLine & { id: string; price: number }
type EventInfo = { sport: string; home: string; away: string; startsAt: string; homeRecord?: string | null; awayRecord?: string | null; scoreGame?: ScoreGame }
type Market = DisplayMarket & {
  id: string
  lockAt: string
  exchangeOkAt?: string | null
  picked: { selection: string; stake: number } | null
  event: EventInfo
  lines: Line[]
}
type PickRow = {
  id: string
  selection: string
  stake: number
  price: number
  point: number | null
  totalReturn: number
  payout: number | null
  status: string
  acceptedAt: string
  live?: boolean
  you?: boolean
  market: { kind: string; player: string | null; statKey: string | null }
  event: EventInfo
}
type Detail = {
  league: { id: string; name: string; emoji: string; accent: string; sports: string[]; inviteCode: string; startingCredits: number; maxStakePct: number; liveBetting: boolean; endsAt: string | null; isOwner: boolean }
  you: { credits: number }
  limits: { minStake: number; maxStake: number; maxOpenPicks: number; parlay?: ParlayLimits }
  standings: { name: string; credits: number; isYou: boolean }[]
  liveEvents?: (EventInfo & { id: string })[]
  markets: Market[]
  picks: PickRow[]
  leaguePicks: (PickRow & { name: string })[]
  parlays?: ParlayRow[]
  leagueParlays?: ParlayRow[]
}

/** The freshly fetched market and line for what the user selected (same ids; the line row is updated in place on a reprice). */
function resolveSelected(markets: Market[], sel: { market: Market; line: Line }): { market: Market; line: Line } | null {
  const market = markets.find((m) => m.id === sel.market.id)
  const line = market?.lines.find((l) => l.id === sel.line.id)
  return market && line ? { market, line } : null
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
const credits = formatCredits

export default function SportsLeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [, , visit] = useFantasyMode()
  // Landing here means Sports is the side you're on; "Fantasy leagues" then returns to it.
  useEffect(() => visit("sports"), [visit])

  const { data, error, loading, refetch } = useApi<Detail>(`/api/sports/leagues/${id}`, [], { refreshMs: 20_000 })
  const [selected, setSelected] = useState<{ market: Market; line: Line } | null>(null)
  const [liveSelected, setLiveSelected] = useState<LivePickSelection | null>(null)
  const [livePending, setLivePending] = useState(false)
  // Manage mode: the pick slip shows a pick or parlay you hold (sell it back, add more). Exclusive with a selected line and parlay legs.
  const [managing, setManaging] = useState<{ kind: "pick" | "parlay"; id: string } | null>(null)
  const [sport, setSport] = useState<string>("all")
  const sportFilters = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const strip = sportFilters.current
    const active = strip?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!strip || !active || strip.scrollWidth <= strip.clientWidth) return
    const left = active.offsetLeft - strip.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2
    strip.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }, [sport])
  // The sport strip fades at whichever edge still has chips beyond it, so it reads as swipeable.
  useEffect(() => {
    const strip = sportFilters.current
    if (!strip) return
    const sync = () => {
      strip.dataset.more = strip.scrollWidth <= strip.clientWidth + 1 ? "none" : strip.scrollLeft <= 1 ? "end" : strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1 ? "start" : "both"
    }
    sync()
    strip.addEventListener("scroll", sync, { passive: true })
    const resize = new ResizeObserver(sync)
    resize.observe(strip)
    return () => { strip.removeEventListener("scroll", sync); resize.disconnect() }
  }, [data?.league.sports.length])
  const [view, setView] = useState<"upcoming" | "live">("upcoming")
  const [query, setQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const searchButton = useRef<HTMLButtonElement>(null)
  const refocusSearchButton = useRef(false)
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus({ preventScroll: true })
    else if (refocusSearchButton.current) { refocusSearchButton.current = false; searchButton.current?.focus() }
  }, [searchOpen])
  const closeSearch = () => { refocusSearchButton.current = true; setQuery(""); setSearchOpen(false) }
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer) }, [])
  const parlay = useParlay(data?.markets, now, data?.limits.parlay)
  const slipRef = useRef<HTMLDivElement>(null)
  const yourPicksRef = useRef<HTMLElement>(null)
  const [revealPicks, setRevealPicks] = useState(false)
  const [slipVisible, setSlipVisible] = useState(true)
  // The real slip is back in its own place (its top edge is on screen), as opposed to merely peeking in at the edge of the viewport.
  const [slipHome, setSlipHome] = useState(true)
  // Pinned = the member opened the floating slip and has not collapsed it. It follows them down the page, and tucks away while the real slip is on screen.
  const [floatPinned, setFloatPinned] = useState(false)
  const floatOpen = floatPinned && !slipHome
  // Phone: the pick sheet can be tucked down to a bar so you can keep browsing and adding legs.
  const [sheetMin, setSheetMin] = useState(false)
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)")
    const sync = () => setPhone(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])
  const [placed, setPlaced] = useState(false)
  const [anchorHeight, setAnchorHeight] = useState<number | null>(null)
  const [draft, setDraft] = useState<{ stake: number; toWin: number | null }>({ stake: 0, toWin: null })
  const onDraft = useCallback((next: { stake: number; toWin: number | null }) => setDraft((prev) => (prev.stake === next.stake && prev.toWin === next.toWin ? prev : next)), [])
  const dockRef = useRef<HTMLDivElement>(null)
  const floatClose = useRef<HTMLButtonElement>(null)
  const summaryRef = useRef<HTMLButtonElement>(null)
  const refocusSummary = useRef(false)
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const openFloat = () => { setAnchorHeight(dockRef.current?.offsetHeight ?? null); setPlaced(false); setFloatPinned(true) }
  const closeFloat = (restoreFocus = true) => { refocusSummary.current = restoreFocus; setFloatPinned(false); setPlaced(false) }
  const activeSlip = parlay.mode === "parlay" ? parlay.legs.length > 0 : !!selected || !!liveSelected || !!managing
  // An empty slip is never tucked away, and picking a different single line opens the sheet; adding parlay legs leaves it as it is.
  const singleKey = parlay.mode === "single" ? (managing ? `manage:${managing.id}` : liveSelected ? `${liveSelected.eventId}:${liveSelected.side}` : selected?.line.id ?? "") : ""
  useEffect(() => { if (!activeSlip) setSheetMin(false) }, [activeSlip])
  // Sold, settled or gone elsewhere: the slip returns to empty.
  useEffect(() => {
    if (!managing || !data) return
    const open = managing.kind === "pick" ? data.picks.some((p) => p.id === managing.id && p.status === "open") : (data.parlays ?? []).some((p) => p.id === managing.id && p.status === "open")
    if (!open) setManaging(null)
  }, [managing, data])
  useEffect(() => { if (singleKey) setSheetMin(false) }, [singleKey])
  useEffect(() => {
    if (!slipRef.current) return
    const observer = new IntersectionObserver(([entry]) => {
      setSlipVisible(!!entry && entry.intersectionRatio >= .2)
      setSlipHome(!!entry && entry.isIntersecting && entry.boundingClientRect.top >= 0)
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) })
    observer.observe(slipRef.current)
    return () => observer.disconnect()
  }, [data?.league.id])
  // Scrolling back up to the real slip only hides the floating one; scrolling down brings it back until Collapse. Emptying the slip unpins it.
  useEffect(() => { if (floatPinned && slipHome && placed) setPlaced(false) }, [floatPinned, slipHome, placed])
  useEffect(() => { if (floatPinned && !activeSlip && !placed) setFloatPinned(false) }, [floatPinned, activeSlip, placed])
  useEffect(() => {
    if (!floatOpen) return
    floatClose.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !livePending) closeFloat() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closeFloat only sets state
  }, [floatOpen, livePending])
  useEffect(() => {
    if (floatOpen || !refocusSummary.current) return
    refocusSummary.current = false
    summaryRef.current?.focus({ preventScroll: true })
  })
  useEffect(() => {
    if (!revealPicks || !yourPicksRef.current) return
    const section = yourPicksRef.current
    section.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })
    section.focus({ preventScroll: true })
    setRevealPicks(false)
  }, [revealPicks])
  async function onPickPlaced() {
    // From the floating ticket, stay put and offer a link instead of jumping the page.
    if (floatOpen) setPlaced(true)
    await refetch()
    if (!floatOpen) setRevealPicks(true)
  }
  function startManage(target: ManageTarget) {
    if (livePending) return
    setSelected(null)
    setLiveSelected(null)
    parlay.clear()
    parlay.setMode("single")
    setManaging(target.kind === "pick" ? { kind: "pick", id: target.pick.id } : { kind: "parlay", id: (target.parlay.parts?.[0] ?? target.parlay).id })
    setSheetMin(false)
    // Desktop: open the slip dock like Open slip does when the slip is off screen; otherwise bring it into view. Phone: the bottom sheet opens.
    if (!phone && !slipVisible) openFloat()
    else if (!phone) slipRef.current?.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "instant" : "smooth" })
  }
  const sportsKey = data?.league.sports.slice().sort().join(",")
  const scores = useApi<{games: ScoreGame[]; failedSports: string[]}>(sportsKey ? `/api/sports/scoreboard?sports=${sportsKey}` : null, [], { refreshMs: 30_000 })
  const liveSportsKey = [...new Set((scores.data?.games ?? []).filter(g => g.status === 'live').map(g => g.sport))].sort().join(',')
  const liveScores = useApi<{games: ScoreGame[]; failedSports: string[]}>(liveSportsKey ? `/api/sports/scoreboard?sports=${liveSportsKey}&live=1` : null, [], { refreshMs: 10_000 })
  const [demo, setDemo] = useState<string | null>(null)
  useEffect(() => setDemo(new URLSearchParams(window.location.search).get("demo")), [])
  const [lockFx, setLockFx] = useState<PickLockFx | null>(null)
  const clearLockFx = useCallback(() => setLockFx(null), [])
  // ?demo=lock replays the lock-in animation every few seconds without placing a pick.
  useEffect(() => {
    if (demo !== "lock") return
    const play = () => setLockFx({ id: Date.now(), color: "#c8102e", ink: "#ffffff", title: "Chiefs -3.5", sub: "250 at -110 · to win 227", odds: "-110", from: 1000, to: 750 })
    const first = setTimeout(play, 600)
    const every = setInterval(play, 4000)
    return () => { clearTimeout(first); clearInterval(every) }
  }, [demo])

  // ?demo=prices nudges every price (and live score) every few seconds so the live-number motion can be previewed.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (demo !== "prices") return
    const every = setInterval(() => setTick((n) => n + 1), 3500)
    return () => clearInterval(every)
  }, [demo])

  if (loading && !data) return <LeaguePageSkeleton />
  if (!data) return <p className="text-sm text-muted-foreground">{error ?? "Couldn't load this league."}</p>

  const { league, you, standings, picks, leaguePicks } = data
  const markets = demo === "prices" && tick > 0 ? data.markets.map((m, mi) => ({ ...m, lines: m.lines.map((l, li) => (m.kind === "moneyline" || m.kind === "spread" ? { ...l, price: demoPrice(l.price, tick, mi + li) } : l)) })) : data.markets
  // Prices can be refreshed until kickoff, so the slip always shows the price from the latest fetch. A line or market that has
  // since closed drops out and the slip clears; the price you are shown is the price sent, and the server refuses a stale one.
  const current = selected ? resolveSelected(markets, selected) : null
  // The market closed (frozen, locked or gone) while it was on the slip: keep the slip, say so, and block submitting.
  const gone = !!selected && !current
  const parlays = data.parlays ?? []
  const leagueParlays = data.leagueParlays ?? []
  // Everyone's parlays for stats: yours (named for the leaderboard) plus the league's, once each.
  const yourName = standings.find((p) => p.isYou)?.name
  const statParlays = [...leagueParlays, ...parlays.filter((p) => !leagueParlays.some((q) => q.id === p.id)).map((p) => ({ ...p, name: yourName, you: true }))]
  const atRisk = picks.filter((p) => p.status === "open").reduce((sum, p) => sum + p.stake, 0) + parlays.filter((p) => p.status === "open").reduce((sum, p) => sum + p.stake, 0)
  const managedTarget: ManageTarget | null = managing
    ? managing.kind === "pick"
      ? (() => { const pick = picks.find((p) => p.id === managing.id && p.status === "open"); return pick ? { kind: "pick" as const, pick } : null })()
      : (() => { const stacked = stackParlays(parlays.filter((p) => p.status === "open")).find((p) => (p.parts ?? [p]).some((x) => x.id === managing.id)); return stacked ? { kind: "parlay" as const, parlay: stacked } : null })()
    : null
  const ended = !!league.endsAt && new Date(league.endsAt).getTime() < Date.now()
  const status = ended ? "Final standings" : league.endsAt ? timeLeft(league.endsAt) : "No end"
  const scoreGames = mergeLiveScores(scores.data?.games ?? [], liveScores.data?.games ?? []).map((g) => (demo === "prices" && tick > 0 && g.status === "live" ? { ...g, homeScore: String((Number(g.homeScore) || 0) + 7 * Math.floor(tick / 3)), awayScore: String((Number(g.awayScore) || 0) + 3 * Math.floor(tick / 4)) } : g))
  const shown = markets.filter(m => (sport === "all" || m.event.sport === sport) && matchesSearch(query, [m.event.home, m.event.away, m.player], m.event.sport) && Date.parse(m.lockAt) > now && Date.parse(m.event.startsAt) > now).map(m => {
    const meta = scoreboardMatch(m.event, scoreGames)
    return meta ? { ...m, event: { ...m.event, homeRecord: meta.homeRecord, awayRecord: meta.awayRecord, scoreGame: meta } } : m
  })
  const liveGames = scoreGames.filter(g => (sport === "all" || g.sport === sport) && matchesSearch(query, [g.home, g.away], g.sport))
  const searching = query.trim().length > 0
  // A failed refresh keeps the last good list; useApi clears `error` at the start of each poll, so only a load with nothing to show counts, or the notice would blink in and out.
  const scoresFailed = (!scores.data && !!scores.error) || (scores.data?.failedSports ?? []).some(s => sport === "all" || s === sport)

  return (
    <div className="fw fw-play-space" data-play-world="sports" data-accent={league.accent}>
      <Link href="/fantasy" className="fw-back">
        <ArrowLeft className="size-3.5" aria-hidden /> Fantasy leagues
      </Link>

      <LeagueHero
        league={league}
        standings={standings}
        you={you}
        atRisk={atRisk}
        openCount={picks.filter((p) => p.status === "open").length + parlays.filter((p) => p.status === "open").length}
        leaguePicks={[...leaguePicks, ...parlayStatRows(statParlays)]}
        status={status}
        invite={<>{league.isOwner && id !== "sample" ? <PickLimitsButton leagueId={league.id} startingCredits={league.startingCredits} maxStakePct={league.maxStakePct} liveBetting={league.liveBetting} onSaved={() => void refetch()} /> : null}<InviteButton code={league.inviteCode} /></>}
      />

      <div className="fw-grid">
        <div className="fw-main">
          <section className="fw-panel sp-open-lines reveal" style={revealStyle(2)} aria-labelledby="sp-markets-title">
            <div className="fw-section-head">
              <div className="sp-title-copy"><h2 id="sp-markets-title">Open lines<InfoTip side="bottom" label="How lines work" text={<>Everyone gets the same line, and it can update until kickoff. Once you lock a pick, your price never changes. <b>+125</b> means 100 cash wins 125. <b>-110</b> means risking 110 wins 100. On a <b>spread</b>, your team must win by more than the number (or lose by less).</>} /></h2><p>{view === "upcoming" ? "Live prices from real markets · pick before kickoff or live in game · build parlays · play money only" : "Pregame picks are locked · live picks open on games showing a live price"}</p></div>
              <div className="sp-view-switch" data-view={view} role="group" aria-label="Game status">
                <button type="button" aria-pressed={view === "upcoming"} onClick={() => setView("upcoming")}><CalendarDays aria-hidden /><span>Upcoming</span></button>
                <button type="button" aria-pressed={view === "live"} onClick={() => setView("live")}><Radio aria-hidden /><span>Live</span><i aria-hidden /></button>
              </div>
            </div>
            <div className="sp-filter-bar" data-search={searchOpen || undefined}>
              {league.sports.length > 1 ? (
                <div ref={sportFilters} className="sp-filter fw-choices" role="group" aria-label="Filter by sport">
                  <Choice active={sport === "all"} onClick={() => setSport("all")}>
                    All
                  </Choice>
                  {league.sports.map((s) => (
                    <Choice key={s} active={sport === s} onClick={() => setSport(s)}>
                      <LeagueBrand sport={s} />
                    </Choice>
                  ))}
                </div>
              ) : <span className="sp-filter-gap" />}
              <ParlayModeBar mode={parlay.mode} disabled={livePending} onMode={(m) => { if (livePending) return; setSelected(null); setLiveSelected(null); setManaging(null); parlay.setMode(m) }} count={parlay.legs.length} />
              <div className="sp-search" role="search" data-open={searchOpen || undefined}>
                <button ref={searchButton} type="button" className="sp-search-trigger" aria-label="Search games" title="Search games" aria-expanded={searchOpen} tabIndex={searchOpen ? -1 : 0} onClick={() => setSearchOpen(true)}><Search aria-hidden /><span>Search</span></button>
                <div className="sp-search-field" aria-hidden={!searchOpen}>
                  <Search className="sp-search-icon" aria-hidden />
                  <input
                    ref={searchInput}
                    type="search"
                    value={query}
                    tabIndex={searchOpen ? 0 : -1}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); closeSearch() } }}
                    onBlur={() => { if (!query) setSearchOpen(false) }}
                    placeholder="Team, player or league"
                    aria-label="Search games"
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="search"
                  />
                  <button type="button" className="sp-search-done" tabIndex={searchOpen ? 0 : -1} aria-label={query ? "Clear and close search" : "Close search"} onMouseDown={(e) => e.preventDefault()} onClick={closeSearch}><X aria-hidden /></button>
                </div>
              </div>
            </div>
            {parlay.mode === "parlay" && parlay.note ? <div className="sp-parlay-guidance"><p className="pl-note" role="status">{parlay.note}</p></div> : null}
            {view === "upcoming" ? <ParlayIdsContext.Provider value={parlay.mode === "parlay" ? parlay.ids : null}><div className="sp-scroll">{searching && shown.length === 0 ? <p className="fw-empty" role="status">No games match &ldquo;{query.trim()}&rdquo;</p> : <Markets markets={shown} selected={parlay.mode === "parlay" ? null : current} onSelect={(market, line) => { if (livePending) return; setLiveSelected(null); setManaging(null); parlay.mode === "parlay" ? parlay.toggle(market, line) : setSelected({ market, line }) }} disabled={ended || livePending} now={now} />}</div></ParlayIdsContext.Provider> : <ParlayIdsContext.Provider value={parlay.mode === "parlay" ? parlay.ids : null}><ScoreboardGames renderUpcoming={(game) => {
              const matching = shown.filter((market) => scoreboardMatch(market.event, [game]))
              if (!matching.length) return null
              return <GameCard game={{ key: `${game.sport}:${game.id}`, event: matching[0]!.event, markets: matching }} selected={parlay.mode === "parlay" ? null : current} onSelect={(market, line) => { if (livePending) return; setLiveSelected(null); setManaging(null); parlay.mode === "parlay" ? parlay.toggle(market, line) : setSelected({ market, line }) }} disabled={ended || livePending} now={now} />
            }} onShowUpcoming={() => setView("upcoming")} query={searching ? query.trim() : undefined} enableAdminTest={id !== "sample"} livePick={{ leagueId: league.id, liveBetting: id === "sample" || league.liveBetting, mode: parlay.mode, selected: liveSelected, busy: livePending, onSelect: (selection) => { if (livePending || ended) return; setSelected(null); setManaging(null); setLiveSelected(selection); parlay.setMode("single") }, credits: data.you.credits, startingCredits: league.startingCredits, maxStakePct: league.maxStakePct ?? 10, onPlaced: () => void onPickPlaced() }} games={liveGames} tracked={data.liveEvents ?? []} now={now} loading={scores.loading && !scores.data} failed={scoresFailed} /></ParlayIdsContext.Provider>}
          </section>

          <section className="fw-panel reveal" style={revealStyle(3)} aria-labelledby="sp-standings-title">
            <div className="fw-section-head">
              <h2 id="sp-standings-title">Leaderboard</h2>
              <p>Cash, form and record</p>
            </div>
            <Leaderboard standings={standings} start={league.startingCredits} leaguePicks={leaguePicks} parlays={statParlays} demo={demo === "ranks"} />
          </section>


        </div>

        <aside aria-label="Pick slip and your picks" className="fw-rail sp-sports-rail reveal" style={revealStyle(3)}>
          <PickLockEffect fx={lockFx} onDone={clearLockFx} />
          <div ref={slipRef} className="sp-slip-anchor" style={floatOpen && anchorHeight ? { minHeight: anchorHeight } : undefined}>
          <div ref={dockRef} className="sp-slip-dock" data-active={activeSlip || undefined} data-sheet-min={(phone && sheetMin) || undefined} data-float={floatOpen || undefined} data-placed={(floatOpen && placed) || undefined} role={floatOpen ? "dialog" : undefined} aria-label={floatOpen ? "Your pick slip" : undefined}>
          {floatOpen ? <div className="sp-float-bar"><span>Your slip</span><button ref={floatClose} type="button" disabled={livePending} onClick={() => closeFloat()} aria-label="Collapse slip"><ChevronDown aria-hidden /> Collapse</button></div> : null}
          {floatOpen && placed ? <div className="sp-float-done" role="status"><span className="sp-float-check" aria-hidden><Check /></span><strong>Pick locked in</strong><p>Your slip is cleared and your cash is updated.</p><button type="button" className="fw-btn" data-solid onClick={() => { closeFloat(false); setRevealPicks(true) }}>View your picks</button><button type="button" className="sp-float-link" onClick={() => closeFloat()}>Keep browsing</button></div> : null}
          <div className="sp-slip-mode" hidden={parlay.mode !== "parlay"}>
            <ParlaySlip
              leagueId={league.id}
              legs={parlay.legs}
              note={parlay.note}
              balance={you.credits}
              limits={data.limits}
              closed={ended}
              onRemove={parlay.remove}
              onClear={parlay.clear}
              onMinimize={() => setSheetMin(true)}
              onAccept={parlay.accept}
              onLock={setLockFx}
              onPlaced={() => {
                parlay.clear()
                void onPickPlaced()
              }}
              onStale={() => void refetch()}
              onDraft={onDraft}
            />
          </div>
          <div className="sp-slip-mode" hidden={parlay.mode !== "single" || !!liveSelected || !!managedTarget}>
          <Slip
            leagueId={league.id}
            selected={current ?? selected}
            gone={gone}
            onStale={() => void refetch()}
            balance={you.credits}
            limits={data.limits}
            closed={ended}
            onClear={() => setSelected(null)}
            onMinimize={() => setSheetMin(true)}
            onDraft={onDraft}
            onLock={setLockFx}
            onPlaced={() => {
              setSelected(null)
              void onPickPlaced()
            }}
          />
          </div>
          <div className="sp-slip-mode" hidden={!managedTarget}>
            {managedTarget ? <ManageSlip leagueId={league.id} target={managedTarget} balance={you.credits} limits={data.limits} onClear={() => setManaging(null)} onMinimize={() => setSheetMin(true)} onChanged={() => void refetch()} /> : null}
          </div>
          <div className="sp-slip-mode" hidden={parlay.mode !== "single" || !liveSelected}>
            {liveSelected ? <LivePickSlip key={`${liveSelected.eventId}:${liveSelected.side}`} selection={liveSelected} leagueId={league.id} credits={you.credits} startingCredits={league.startingCredits} maxStakePct={league.maxStakePct ?? 10} demo={id === "sample"} busy={livePending} onBusyChange={setLivePending} onMinimize={() => setSheetMin(true)} onClear={() => { if (!livePending) setLiveSelected(null) }} onAcceptPrice={(price) => setLiveSelected((previous) => previous ? { ...previous, price } : null)} onPlaced={() => { setLiveSelected(null); void onPickPlaced() }} onDraft={onDraft} /> : null}
          </div>
          </div>
          </div>
          <section ref={yourPicksRef} tabIndex={-1} className="fw-panel sp-your-picks reveal" style={revealStyle(4)} aria-labelledby="sp-yours-title">
            <div className="fw-section-head">
              <h2 id="sp-yours-title">Your picks</h2>
              <p>{picks.length + parlays.length === 0 ? "None yet" : plural(picks.length + parlays.length, "pick")}</p>
            </div>
            <PickFeed picks={picks} parlays={parlays} manage={{ onManage: startManage, activeId: managing?.id ?? null }} empty="Nothing yet. Tap a line under Open lines to make your first pick." />
          </section>
          <div className="sp-desktop-context"><LeaguePulse leaguePicks={leaguePicks} parlays={statParlays} /></div>
          <NextGames picks={picks} events={markets.map((market) => market.event)} />
        </aside>
        {/* Under the leaderboard on desktop (it fills the column beside the tall rail); after the rail on phones. */}
        <div className="sp-lower">
          <section className="fw-panel reveal" data-flat style={revealStyle(4)} aria-labelledby="sp-locked-title">
            <div className="fw-section-head">
              <h2 id="sp-locked-title">Locked picks</h2>
              <p>Everyone&apos;s picks, shown after each game locks at kickoff</p>
            </div>
            <PickFeed picks={leaguePicks} parlays={leagueParlays} showName history empty="Picks show up here after each market locks, never before." />
          </section>
          {id !== "sample" ? <MirrorReport leagueId={league.id} /> : null}
        </div>
      </div>
      {activeSlip && (phone ? sheetMin : !slipVisible && !floatOpen) ? <button ref={summaryRef} key={parlay.mode === "parlay" ? parlay.legs.map(l => l.market.id + l.line.id).join(":") : managing ? managing.id : liveSelected ? liveSelected.eventId + liveSelected.side : selected?.line.id} type="button" className="sp-review-pick" aria-haspopup="dialog" onClick={() => (phone ? setSheetMin(false) : openFloat())}><span className="sp-review-dot" aria-hidden /><span className="sp-review-copy"><small>{managedTarget ? "MANAGING YOUR PICK" : "ADDED TO YOUR SLIP"}</small><strong>{managedTarget ? (managedTarget.kind === "pick" ? pickSentence({ kind: managedTarget.pick.market.kind, player: managedTarget.pick.market.player, statKey: managedTarget.pick.market.statKey, event: managedTarget.pick.event }, managedTarget.pick) + " · cash out" : plural(managedTarget.parlay.legs.length, "leg") + " parlay · cash out") : parlay.mode === "parlay" ? plural(parlay.legs.length, "leg") + " in your parlay" : liveSelected ? (liveSelected.side === "draw" ? "Draw" : liveSelected.side === "home" ? liveSelected.home : liveSelected.away) + " · " + formatOdds(liveSelected.price) : selected ? pickSentence(selected.market, selected.line) + " · " + formatOdds(selected.line.price) : "Your pick"}</strong>{draft.stake > 0 && draft.toWin != null ? <em className="numeric">{formatCredits(draft.stake)} to win {formatCredits(draft.toWin)}</em> : null}</span><span className="sp-review-action">Open slip <ArrowUp aria-hidden /></span></button> : null}
      {/* Keeps the last rows clear of the phone pick sheet. */}
      <div className="sp-sheet-spacer" data-on={selected || liveSelected || managedTarget || (parlay.mode === "parlay" && parlay.legs.length > 0) ? "" : undefined} aria-hidden />
    </div>
  )
}

function InviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      className="fw-btn fw-invite"
      aria-label={copied ? "Link copied" : `Copy invite link (code ${code})`}
      data-solid
      data-copied={copied || undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(sportsInviteLink(window.location.origin, code))
          setCopied(true)
        } catch {
          toast("Couldn't copy the invite link. Please try again.", "error")
        }
      }}
    >
      <span className="sp-invite-mark">{copied ? <Check aria-hidden /> : <Link2 aria-hidden />}</span>
      <span className="fw-invite-label-full" aria-live="polite">{copied ? "Link copied" : <>Invite friends <b className="sp-invite-code">{code}</b></>}</span>
      <span className="fw-invite-label-short">{copied ? "Copied" : "Invite"}</span>
    </button>
  )
}

/** Games shown per day before the rest sit behind a "show more" button. */
const DAY_PREVIEW = 6

function Markets({ markets, selected, onSelect, disabled, now }: { markets: Market[]; selected: { line: Line } | null; onSelect: (m: Market, l: Line) => void; disabled: boolean; now: number }) {
  // Group by game, then by day, in kickoff order (the API already sorts by start).
  const games = useMemo(() => {
    const byEvent = new Map<string, { key: string; event: EventInfo; markets: Market[] }>()
    for (const m of markets) {
      const key = `${m.event.sport}|${m.event.home}|${m.event.away}|${m.event.startsAt}`
      const g = byEvent.get(key) ?? { key, event: m.event, markets: [] }
      g.markets.push(m)
      byEvent.set(key, g)
    }
    // Games that kick off together (a whole NFL slate shares 1:00 PM) need a tiebreak, or they swap places between refreshes.
    return [...byEvent.values()].sort((a, b) => Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt) || a.event.sport.localeCompare(b.event.sport) || a.event.home.localeCompare(b.event.home) || a.event.away.localeCompare(b.event.away))
  }, [markets])

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  if (games.length === 0) return <p className="fw-empty">No open lines right now. Games post about a day ahead.</p>

  const rows: React.ReactNode[] = []
  let lastDay = ""
  let index = 0
  const days = new Map<string, number>()
  for (const g of games) days.set(dayOf(g.event.startsAt), (days.get(dayOf(g.event.startsAt)) ?? 0) + 1)
  for (const g of games) {
    const day = dayOf(g.event.startsAt)
    if (day !== lastDay) index = 0
    const heading = day !== lastDay ? day : null
    lastDay = day
    index += 1
    const total = days.get(day) ?? 0
    const open = expanded.has(day)
    const holdsSelection = selected != null && g.markets.some((m) => m.lines.some((l) => l.id === selected.line.id))
    if (index <= DAY_PREVIEW || open || holdsSelection) {
      rows.push(
        <li key={g.key}>
          {heading ? <h3 className="sp-day">{heading}</h3> : null}
          <GameCard game={g} selected={selected} onSelect={onSelect} disabled={disabled} now={now} />
        </li>,
      )
    }
    if (total > DAY_PREVIEW && (index === total)) {
      rows.push(
        <li key={`more-${day}`} className="sp-more">
          <button type="button" aria-expanded={open} onClick={() => setExpanded((prev) => { const next = new Set(prev); if (next.has(day)) next.delete(day); else next.add(day); return next })}>
            {open ? "Show fewer games" : `Show ${total - DAY_PREVIEW} more game${total - DAY_PREVIEW === 1 ? "" : "s"}`}
          </button>
        </li>,
      )
    }
  }
  return <ul className="sp-events">{rows}</ul>
}

function Slip({
  leagueId,
  selected,
  balance,
  limits,
  closed,
  onClear,
  onMinimize,
  onLock,
  onPlaced,
  onStale,
  onDraft,
  gone,
}: {
  onDraft?: (draft: { stake: number; toWin: number | null }) => void
  leagueId: string
  selected: { market: Market; line: Line } | null
  onStale: () => void
  /** The selected market is no longer open to picks. */
  gone: boolean
  balance: number
  limits: Detail["limits"]
  closed: boolean
  onClear: () => void
  onMinimize: () => void
  onLock: (fx: PickLockFx) => void
  onPlaced: () => void
}) {
  const { toast } = useToast()
  const [stake, setStake] = useState("")
  const [pending, setPending] = useState(false)
  // The price the user has seen and agreed to. If the line moves under them, locking stays disabled until they accept the new price.
  const [agreed, setAgreed] = useState<{ id: string; price: number } | null>(null)
  const moved = !gone && selected && agreed && agreed.id === selected.line.id && agreed.price !== selected.line.price ? agreed.price : null
  // One key per slip: a double tap or a retry after a dropped response places a single pick.
  const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
  const [requestId, setRequestId] = useState(newKey)
  // A different line is a different pick: a fresh stake and idempotency key, but the slip itself stays mounted (no reload flash).
  const lineId = selected?.line.id
  useEffect(() => {
    setStake("")
    setRequestId(newKey())
    setAgreed(lineId && selected ? { id: lineId, price: selected.line.price } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a different line starts a fresh slip; price moves on the same line must not reset it
  }, [lineId])

  const cap = Math.min(limits.maxStake, balance)
  const amount = Math.floor(Number(stake.replace(/[^\d]/g, "")) || 0)
  const winnings = selected ? Math.floor(amount * americanToDecimal(selected.line.price)) - amount : 0
  useEffect(() => { onDraft?.({ stake: selected ? amount : 0, toWin: selected && amount > 0 ? winnings : null }) }, [onDraft, selected, amount, winnings])
  const slipSide = selected ? sideTeam(selected.market.event, selected.market.kind, selected.line.selection) : null
  // Match the selected card, including alternate accents used to distinguish similar teams.
  const slipColor = selected ? marketSelectionColor(selected.market.event, selected.market.kind, selected.line.selection) : null
  const problem =
    amount === 0 ? null : amount < limits.minStake ? `Minimum is ${credits(limits.minStake)}` : amount > limits.maxStake ? `Maximum per pick is ${credits(limits.maxStake)}` : amount > balance ? "Not enough cash" : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || amount === 0 || problem || gone || moved != null) return
    setPending(true)
    try {
      await mutate(`/api/sports/leagues/${leagueId}/picks`, {
        body: { lineId: selected.line.id, stake: amount, expectedPrice: selected.line.price, expectedPoint: selected.line.point, requestId },
      })
      onLock({ id: Date.now(), color: slipColor ?? "#64748b", ink: onColor(slipColor ?? "#64748b"), title: pickSentence(selected.market, selected.line), sub: `${credits(amount)} at ${formatOdds(selected.line.price)} · to win ${credits(winnings)}`, odds: formatOdds(selected.line.price), from: balance, to: balance - amount, big: selected.line.price >= 200 })
      toast("Pick locked in.", "success")
      onPlaced()
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't place that pick."
      toast(message, "error")
      // A moved line: pull the new price so the slip shows it, and let the user decide again.
      if (/line moved|line changed/i.test(message)) onStale()
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="fw-panel fw-trade sp-slip sp-sheet" style={{ ...(slipColor ? ({ "--tc": slipColor, "--tc-ink": onColor(slipColor) } as React.CSSProperties) : null) } as React.CSSProperties} aria-labelledby="sp-slip-title" data-closed={closed || undefined} data-open={selected ? "" : undefined} data-themed={selected ? "" : undefined}>
      {selected ? (
        <SheetHandle onMinimize={onMinimize} disabled={pending} />
      ) : null}
      <div className="fw-section-head">
        <h2 id="sp-slip-title">Pick slip</h2>
        {selected ? (
          <button type="button" className="sp-clear" onClick={onClear} aria-label="Clear pick slip">
            <X aria-hidden /> Clear
          </button>
        ) : (
          <p>{credits(balance)} cash</p>
        )}
      </div>
      {!selected ? (
        <SlipEmpty />
      ) : (
        <form onSubmit={submit}>
          <SlipPickCard sport={selected.market.event.sport} side={slipSide} player={selected.market.kind === "player_prop" ? selected.market.player : null} kicker={marketTitle(selected.market)} title={pickSentence(selected.market, selected.line)} price={selected.line.price} game={`${eventTitle(selected.market.event)} · ${lockLabel(selected.market.lockAt)}`} color={slipColor} />
          <div>
            <label className="fw-label" htmlFor="sp-stake">
              Stake (play cash)
            </label>
            <input
              id="sp-stake"
              className="fw-input numeric"
              inputMode="numeric"
              autoComplete="off"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder={`${credits(limits.minStake)} to ${credits(limits.maxStake)}`}
              aria-describedby="sp-stake-hint"
              aria-invalid={problem ? true : undefined}
            />
            <p className="fw-hint" id="sp-stake-hint" role={problem ? "alert" : undefined}>
              {problem ? <span className="fw-bad">{problem}</span> : <span>Max {credits(limits.maxStake)} per pick (league limit){balance < limits.maxStake ? `, limited by your ${credits(balance)} cash` : ""}</span>}
            </p>
          </div>
          <div className="fw-quick">
            {[limits.minStake, Math.round(cap / 4), Math.round(cap / 2), cap].map((v, i) => (
              <button key={i} type="button" disabled={v < limits.minStake} aria-label={i === 3 ? `Stake the maximum, ${credits(cap)} cash` : `Stake ${credits(v)} cash`} onClick={() => setStake(String(Math.max(v, limits.minStake)))}>
                {i === 3 ? "Max" : credits(v)}
              </button>
            ))}
          </div>
          {/* Always in the DOM so screen readers announce the change; empty (and collapsed) until a price moves. */}
          <p className="sp-slip-moved" role="status" aria-live="polite">
            {moved != null ? `Price updated from ${formatOdds(moved)} to ${formatOdds(selected!.line.price)}. Accept the new price to lock this pick.` : null}
          </p>
          {moved != null ? (
            <button type="button" className="fw-btn" data-solid onClick={() => setAgreed({ id: selected!.line.id, price: selected!.line.price })}>
              Accept new price {formatOdds(selected!.line.price)}
            </button>
          ) : null}
          {gone ? (
            <p className="sp-slip-moved" role="alert">
              This line is no longer open for picks (the game started or the odds moved a lot). <button type="button" className="fw-link" onClick={onClear}>Dismiss</button>
            </p>
          ) : null}
          <div className="sp-slip-return" aria-live="polite">
            <span className="fw-label" style={{ margin: 0 }}>
              To win
            </span>
            {amount > 0 && !problem ? <b>{credits(winnings)}</b> : <span className="sp-slip-hint">Enter a stake</span>}
          </div>
          <button type="submit" className="fw-submit" disabled={pending || closed || gone || moved != null || amount === 0 || !!problem} aria-busy={pending || undefined}>
            {pending ? <span className="spin" aria-hidden /> : null}
            {pending ? "Locking in…" : "Lock in pick"}
          </button>
          <p className="sp-fine">Play money only, nothing real is at stake. Picks can&apos;t be changed after they&apos;re locked in.</p>
        </form>
      )}
    </section>
  )
}

function MirrorReport({ leagueId }: { leagueId: string }) {
  const { data } = useApi<{ pairs: { a: string; b: string; markets: number }[] }>(`/api/sports/leagues/${leagueId}/report`)
  return (
    <section className="fw-panel reveal" style={revealStyle(5)} aria-labelledby="sp-report-title">
      <div className="fw-section-head">
        <h2 id="sp-report-title">Mirrored picks</h2>
        <p>Who keeps picking against each other</p>
      </div>
      {!data ? null : data.pairs.length === 0 ? (
        <p className="fw-empty">No one has picked opposite sides yet.</p>
      ) : (
        <ul className="fw-picks">
          {data.pairs.map((p) => (
            <li key={`${p.a}-${p.b}`} className="fw-pick">
              <div className="fw-pick-body">
                <strong>
                  {p.a} and {p.b}
                </strong>
                <span>Picked opposite sides on {plural(p.markets, "market")}.</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Chance each side wins, from the moneyline prices with the bookmaker's margin taken out. */
function winChances(lines: Line[]): { home: number; away: number; draw: number | null } | null {
  const home = lines.find((l) => l.selection === "home")
  const away = lines.find((l) => l.selection === "away")
  const draw = lines.find((l) => l.selection === "draw")
  if (!home || !away) return null
  // Soccer has a third line; a market that lists a draw line but is missing it is not shown as a two-way split.
  if (lines.length === 3 && !draw) return null
  const ph = 1 / americanToDecimal(home.price)
  const pa = 1 / americanToDecimal(away.price)
  const pd = draw ? 1 / americanToDecimal(draw.price) : 0
  const sum = ph + pa + pd
  return { home: ph / sum, away: pa / sum, draw: draw ? pd / sum : null }
}

/** Left to right on a winner row: away, draw, home (as the matchup reads "away @ home"); tennis lists the first player first. */
const ORDER: Record<string, Record<string, number>> = { teams: { away: 0, draw: 1, home: 2 }, tennis: { home: 0, away: 1, draw: 2 } }

function GameCard({ game, selected, onSelect, disabled, now }: { game: { key: string; event: EventInfo; markets: Market[] }; selected: { line: Line } | null; onSelect: (m: Market, l: Line) => void; disabled: boolean; now: number }) {
  const { event } = game
  const tennis = event.sport === "tennis"
  const baseGroups = (
    [
      { key: "winner", label: "Winner", test: (m: Market) => m.kind === "moneyline" },
      { key: "spread", label: "Spread", test: (m: Market) => m.kind === "spread" },
      { key: "total", label: "Total", test: (m: Market) => m.kind === "total" },
      { key: "props", label: "Props", test: (m: Market) => m.kind === "player_prop" },
    ] as const
  )
    .map((g) => ({ ...g, markets: game.markets.filter(g.test) }))
    .filter((g) => g.markets.length > 0)
  // Spread/Total but no Winner (e.g. a thin soccer book): keep a Winner entry that says so rather than silently dropping it.
  const winnerMissing = !baseGroups.some((g) => g.key === "winner") && baseGroups.some((g) => g.key === "spread" || g.key === "total")
  const groups = winnerMissing ? [{ key: "winner" as const, label: "Winner", test: () => false, markets: [] as Market[] }, ...baseGroups] : baseGroups
  // Open on a market that has lines; the empty Winner entry stays in the dropdown and says why when chosen.
  const [tab, setTab] = useState<string>(baseGroups[0]?.key ?? groups[0]?.key ?? "winner")
  const active = groups.find((g) => g.key === tab) ?? groups[0]
  const winner = game.markets.find((m) => m.kind === "moneyline")
  const chances = winner ? winChances(winner.lines) : null
  const first = tennis ? event.home : event.away
  const second = tennis ? event.away : event.home
  const [firstColor, secondColor] = matchupColors(event.sport, first, second)
  const pricedAt = active?.markets.every(m => m.exchangeOkAt) ? active.markets.map(m => m.exchangeOkAt!).sort()[0] : null
  const quoteAge = pricedAt ? now - Date.parse(pricedAt) : null
  // Quotes refresh continuously; only hide the chip if the feed has clearly stalled.
  const showLive = quoteAge != null && quoteAge < 30 * 60_000

  return (
    <div className="sp-event sp-game" data-matchup style={{ '--away-color': firstColor, '--home-color': secondColor } as React.CSSProperties}>
      <div className="sp-game-head">
        <div className="sp-matchup">
          <strong>{eventTitle(event)}</strong>
        </div>
        <span className="sp-game-meta">
          <b><LeagueBrand sport={event.sport} /></b> · {timeOf(event.startsAt)}
          {event.scoreGame && event.scoreGame.status !== "upcoming" ? <GameStatusChip input={statusInputFromGame(event.scoreGame)} now={now} /> : showLive ? <span className="sp-feed-chip" data-live><i />Live odds</span> : null}
          <select className="sp-market-select" aria-label={`Market for ${eventTitle(event)}`} value={active?.key ?? ""} onChange={e => setTab(e.target.value)}>
            {groups.map(g => <option key={g.key} value={g.key}>{g.markets.length === 0 ? `${g.label} (unavailable)` : g.label}</option>)}
          </select>
        </span>
      </div>

      {chances ? (
        <div className="sp-odds-bar" role="img" aria-label={`Win chance: ${event.away} ${Math.round(chances.away * 100)} percent, ${chances.draw != null ? `draw ${Math.round(chances.draw * 100)} percent, ` : ""}${event.home} ${Math.round(chances.home * 100)} percent`}>
          <div className="sp-odds-track">
            <i style={{ width: `${(tennis ? chances.home : chances.away) * 100}%`, background: firstColor }} />
            {chances.draw != null ? <i style={{ width: `${chances.draw * 100}%`, background: "var(--fw-fg3)" }} /> : null}
            <i style={{ flex: 1, background: secondColor }} />
          </div>
          <div className="sp-odds-labels">
            <span><LiveNumber value={Math.round((tennis ? chances.home : chances.away) * 100)} format={pctText} kind="pct" seenKey={`pct:${game.key}:a`} /> <small>{oddsLabel(event.sport, first)}</small></span>
            {chances.draw != null ? <span><LiveNumber value={Math.round(chances.draw * 100)} format={pctText} kind="pct" seenKey={`pct:${game.key}:d`} /> <small>Draw</small></span> : null}
            <span><small>{oddsLabel(event.sport, second)}</small> <LiveNumber value={Math.round((tennis ? chances.away : chances.home) * 100)} format={pctText} kind="pct" seenKey={`pct:${game.key}:b`} /></span>
          </div>
        </div>
      ) : null}

      {active && active.markets.length === 0 ? (
        <div key={active.key} className="sp-panel" role="note">
          <p className="sp-fine">Winner line unavailable right now. It comes back when the market has enough depth. Spread and Total are still open.</p>
        </div>
      ) : null}

      {active && active.markets.length > 0 ? (
        <div key={active.key} className="sp-panel" role="group" aria-label={`${active.label} markets`}>
          {active.markets.map((m) => (
            <div key={m.id} className="sp-market">
              {active.key === "props" ? <div className="sp-market-head"><span className="sp-market-title">{marketTitle(m)}</span></div> : null}
              <div className={`sp-lines${(m.kind === "moneyline" || m.kind === "spread") ? " sp-team-lines" : ""}`} data-three={m.lines.length === 3 || undefined}>
                {((m.kind === "moneyline" || m.kind === "spread") ? [...m.lines].sort((x, y) => ORDER[tennis ? "tennis" : "teams"]![x.selection]! - ORDER[tennis ? "tennis" : "teams"]![y.selection]!) : m.lines).map((l) => (
                  <LineButton key={l.id} market={m} line={l} selected={selected} onSelect={onSelect} disabled={disabled} team={(m.kind === "moneyline" || m.kind === "spread") && l.selection !== "draw"} color={marketSelectionColor(event, m.kind, l.selection)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Deterministic wobble for ?demo=prices. */
function demoPrice(price: number, tick: number, seed: number) {
  const step = ((tick * 7 + seed * 5) % 5 - 2) * 5
  const next = price + step
  return next > -100 && next < 100 ? (price < 0 ? -105 : 105) : next
}

const pctText = (n: number) => `${n}%`

function LineButton({ market: m, line: l, selected, onSelect, disabled, team, color }: { market: Market; line: Line; selected: { line: Line } | null; onSelect: (m: Market, l: Line) => void; disabled: boolean; team?: boolean; color?: string }) {
  const label = lineLabel(m, l)
  const mine = m.picked?.selection === l.selection
  const side = sideTeam(m.event, m.kind, l.selection)
  const parlayIds = useContext(ParlayIdsContext)
  const inParlay = parlayIds?.has(l.id) ?? false
  // A line you already hold as a single can still be a parlay leg; only single mode treats it as taken.
  const taken = !!m.picked && !parlayIds
  return (
    <button
      type="button"
      className="sp-line"
      data-team={team || undefined}
      data-accent={color || undefined}
      aria-pressed={selected?.line.id === l.id || inParlay || (mine && taken)}
      data-picked={mine || undefined}
      disabled={disabled || taken}
      style={color ? ({ "--tc": color, "--tc-ink": onColor(color) } as React.CSSProperties) : undefined}
      aria-label={`${pickSentence(m, l)}, ${formatOdds(l.price)}, 100 cash wins ${winOn100(l.price)}${mine ? `, your pick, ${credits(m.picked!.stake)}` : ""}`}
      onClick={() => onSelect(m, l)}
    >
      {team && side ? <TeamBadge sport={m.event.sport} name={side} size={40} /> : m.kind === "player_prop" && m.player ? <PlayerBadge sport={m.event.sport} name={m.player} size={32} /> : <span className="sp-market-symbol" aria-hidden>{l.selection === "over" ? <ArrowUp/> : l.selection === "under" ? <ArrowDown/> : "="}</span>}
      <span className="sp-line-name">
        {label.name}
        {label.point ? <small>{label.point}</small> : null}
        {team && side ? <small className="sp-team-record">{(l.selection === "home" ? m.event.homeRecord : m.event.awayRecord) ? ` (${l.selection === "home" ? m.event.homeRecord : m.event.awayRecord})` : null}</small> : null}
        {(selected?.line.id === l.id || inParlay) && !taken ? <Check className="sp-selected-check" aria-label="Selected"/> : null}
        {mine ? (
          <em className="sp-line-tag">
            <Lock aria-hidden /> Your pick · {credits(m.picked!.stake)}
          </em>
        ) : null}
      </span>
      <span className="sp-line-odds">
        <span className="sp-price"><LiveNumber value={l.price} format={formatOdds} kind="price" seenKey={`line:${l.id}`} /></span>
        <small>$100 wins ${winOn100(l.price)}</small>
      </span>
    </button>
  )
}
