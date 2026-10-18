/**
 * Compact, honest game status for cards ("Q3 7:59", "Top 7th", "72'", "Starts 7:30 PM").
 * VIEW ONLY: pure display code. Never read by pricing, picks or settlement.
 *
 * Rules: show only what the feed reported. Stop-start clocks (football, basketball, hockey) are shown as last
 * reported and dimmed once older than DIM_AFTER_MS. Only a continuously running clock (soccer) ticks locally, and
 * only while the update is fresh. Past STALE_AFTER_MS we drop the clock and show the period only, or "Delayed".
 */
import type { TennisSet } from './scoreboard.ts'

export const DIM_AFTER_MS = 30_000
export const TICK_WITHIN_MS = 45_000
export const STALE_AFTER_MS = 120_000

export type StatusInput = {
  sport: string
  status: 'upcoming' | 'live' | 'final' | 'unavailable'
  /** ESPN status name, e.g. STATUS_HALFTIME. */
  statusName?: string
  /** ESPN shortDetail, used only for baseball innings and soccer stoppage time. */
  detail?: string
  period?: number
  clock?: string
  startsAt: string
  /** When the feed last reported this state (ISO string or epoch ms). */
  asOf: string | number
  homeSets?: TennisSet[]
  awaySets?: TennisSet[]
}
export type GameStatus = {
  text: string
  /** Secondary text (tennis set scores); optional to render. */
  extra?: string
  tone: 'pre' | 'live' | 'break' | 'final' | 'alert'
  /** The value is older than DIM_AFTER_MS: render subdued. */
  dim: boolean
  /** Full wording for aria-label / title. */
  label: string
}

const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
const ORD_WORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth']
const PERIOD_SPORTS: Record<string, { regulation: number; prefix: string; noun: string }> = {
  nfl: { regulation: 4, prefix: 'Q', noun: 'quarter' }, cfb: { regulation: 4, prefix: 'Q', noun: 'quarter' },
  nba: { regulation: 4, prefix: 'Q', noun: 'quarter' }, nhl: { regulation: 3, prefix: 'P', noun: 'period' },
}

/** A clock string only if it looks like one ("7:59", "0:03", "45.2"); anything else is dropped, never shown. */
export function cleanClock(raw: string | undefined | null): string | null {
  const t = (raw ?? '').trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (m) return `${Number(m[1])}:${m[2]}`
  return /^\d{1,2}\.\d$/.test(t) ? t : null
}
function periodText(sport: string, n: number): { short: string; long: string } | null {
  const cfg = PERIOD_SPORTS[sport]
  if (!cfg || !Number.isInteger(n) || n < 1) return null
  if (n <= cfg.regulation) return { short: `${cfg.prefix}${n}`, long: `${ORD_WORD[n]} ${cfg.noun}` }
  const ot = n - cfg.regulation
  // Hockey regular season has a single OT; football and basketball number them.
  const t = ot === 1 ? 'OT' : `${ot}OT`
  return { short: t, long: ot === 1 ? 'overtime' : `${ORD_WORD[ot] ?? ot} overtime` }
}
function baseball(detail: string | undefined): { half: 'Top' | 'Bot' | 'Mid' | 'End'; inning: number } | null {
  const m = /^(Top|Bot|Bottom|Mid|Middle|End)\s+(?:of\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?$/i.exec((detail ?? '').trim())
  if (!m) return null
  const w = m[1].toLowerCase()
  return { half: w === 'top' ? 'Top' : w.startsWith('b') ? 'Bot' : w.startsWith('m') ? 'Mid' : 'End', inning: Number(m[2]) }
}
/** Soccer minute: "72'" -> {base: 72}; "90'+3'" -> {base: 90, added: 3}; "72:15" -> {base: 72, secs: 15}. */
function soccerMinute(clock: string | undefined, detail: string | undefined): { base: number; added?: number; secs?: number } | null {
  for (const src of [clock, detail]) {
    const t = (src ?? '').trim()
    const stop = /^(\d{1,3})'?\s*\+\s*(\d{1,2})'?$/.exec(t)
    if (stop) return { base: Number(stop[1]), added: Number(stop[2]) }
    const run = /^(\d{1,3})'$/.exec(t)
    if (run) return { base: Number(run[1]) }
    const mmss = /^(\d{1,3}):(\d{2})$/.exec(t)
    if (mmss) return { base: Number(mmss[1]), secs: Number(mmss[2]) }
  }
  return null
}
function startsLabel(startsAt: string, now: number, tz?: string): string {
  const d = new Date(startsAt)
  if (!Number.isFinite(d.getTime())) return 'Upcoming'
  const day = (x: Date | number) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x)
  const time = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d)
  return day(d) === day(now) ? `Starts ${time}` : `${new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short' }).format(d)} ${time}`
}
const setScores = (h?: TennisSet[], a?: TennisSet[]) =>
  h?.length && a?.length && h.length === a.length ? h.map((s, i) => `${s.games}-${a[i].games}`).join(' ') : undefined

export function formatGameStatus(g: StatusInput, now: number, tz?: string): GameStatus {
  const name = g.statusName ?? ''
  const asOf = typeof g.asOf === 'number' ? g.asOf : Date.parse(g.asOf)
  const age = Number.isFinite(asOf) ? Math.max(0, now - asOf) : Infinity
  const mk = (text: string, tone: GameStatus['tone'], label = text, extra?: string, dim = false): GameStatus => ({ text, tone, dim, label, ...(extra ? { extra } : {}) })

  // Past its scheduled start but the feed has not flipped to live yet: say so instead of showing a start time that has already gone by.
  if (g.status === 'upcoming') { if (Date.parse(g.startsAt) <= now) return mk('Starting', 'pre'); const t = startsLabel(g.startsAt, now, tz); return mk(t, 'pre') }
  if (g.status === 'final') {
    const t = /FINAL_?(OT|PEN|SO|SHOOT)/i.test(name) ? (/OT/i.test(name) ? 'Final/OT' : 'Final/SO') : 'Final'
    return mk(t, 'final', t === 'Final' ? 'Final' : `Final, ${t.slice(6) === 'OT' ? 'after overtime' : 'after shootout'}`)
  }
  if (g.status === 'unavailable' || /POSTPON|CANCEL|DELAY|SUSPEND|RAIN|FORFEIT/.test(name)) {
    if (/POSTPON/.test(name)) return mk('Postponed', 'alert')
    if (/CANCEL/.test(name)) return mk('Canceled', 'alert')
    return mk('Delayed', 'alert')
  }

  // In progress from here.
  const tennis = g.sport === 'tennis', soccer = g.sport === 'mls', mlb = g.sport === 'mlb'
  const sets = tennis ? setScores(g.homeSets, g.awaySets) : undefined
  const period = PERIOD_SPORTS[g.sport] ? periodText(g.sport, g.period ?? 0) : null
  const inning = mlb ? baseball(g.detail) : null
  const setNo = tennis && g.homeSets?.length ? g.homeSets.length : null
  // Period-only wording, used when the clock can't be trusted.
  const periodOnly = period?.short ?? (inning ? ord(inning.inning) : setNo ? `Set ${setNo}` : null)
  const stale = age > STALE_AFTER_MS
  if (stale) return periodOnly ? mk(`Live · ${periodOnly}`, 'live', `Live, ${periodOnly}. Score feed delayed`, undefined, true) : mk('Delayed', 'alert', 'Score feed delayed')

  const dim = age > DIM_AFTER_MS
  if (/HALFTIME/.test(name)) return mk(soccer ? 'HT' : 'Half', 'break', 'Halftime', undefined, dim)
  if (/END_OF_REG|END_REG/.test(name) && !mlb) return mk('End Reg', 'break', 'End of regulation', undefined, dim)
  if (/SHOOTOUT/.test(name)) return mk(soccer ? 'Pens' : 'SO', 'live', soccer ? 'Penalty shootout' : 'Shootout', undefined, dim)
  if (/END_PERIOD|INTERMISSION/.test(name) && period) return mk(`End ${period.short}`, 'break', `End of ${period.long}`, undefined, dim)

  if (mlb) {
    if (inning) return mk(`${inning.half} ${ord(inning.inning)}`, inning.half === 'Mid' || inning.half === 'End' ? 'break' : 'live', `${inning.half === 'Bot' ? 'Bottom' : inning.half === 'Mid' ? 'Middle' : inning.half === 'End' ? 'End' : 'Top'} of the ${ord(inning.inning)} inning`, undefined, dim)
    return mk('Live', 'live')
  }
  if (soccer) {
    if (/HALF.?TIME|STATUS_HALF$/.test(name)) return mk('HT', 'break', 'Halftime', undefined, dim)
    const m = soccerMinute(g.clock, g.detail)
    if (!m) return mk('Live', 'live', 'In progress', undefined, dim)
    if (m.added != null) return mk(`${m.base}+${m.added}'`, 'live', `${m.base} plus ${m.added} minutes`, undefined, dim)
    // Only a clock that reports seconds can be advanced honestly; a bare minute stays as reported until the next update.
    const minute = m.secs != null && age <= TICK_WITHIN_MS ? Math.floor((m.base * 60 + m.secs + age / 1000) / 60) : m.base
    return mk(`${minute}'`, 'live', `${minute} minutes`, undefined, dim)
  }
  if (tennis) return setNo ? mk(`Set ${setNo}`, 'live', `Set ${setNo}${sets ? `, set scores ${sets.split(' ').join(', ')}` : ''}`, sets, false) : mk('Live', 'live')
  if (period) {
    const clock = cleanClock(g.clock)
    const t = clock && clock !== '0:00' ? `${period.short} ${clock}` : period.short
    return mk(t, 'live', clock ? `${period.long}, ${clock} left${dim ? ', as of last update' : ''}` : period.long, undefined, dim)
  }
  return mk('Live', 'live', 'In progress', undefined, dim)
}

/** Overlay a newer live-worker state (period "Q3", clock "05:12") onto an ESPN-derived input; ignored unless it parses and is newer. */
export function mergeLiveState(input: StatusInput, live: { period: string | null; clock: string | null; stateAsOf: string | null } | null | undefined): StatusInput {
  if (!live?.stateAsOf || input.status !== 'live' || !PERIOD_SPORTS[input.sport]) return input
  const t = Date.parse(live.stateAsOf)
  if (!Number.isFinite(t) || t <= (typeof input.asOf === 'number' ? input.asOf : Date.parse(input.asOf))) return input
  const m = /^(?:Q|P)?(\d)$/.exec((live.period ?? '').trim())
  const clock = cleanClock(live.clock)
  if (!m || !clock) return input
  return { ...input, period: Number(m[1]), clock, statusName: undefined, asOf: t }
}
