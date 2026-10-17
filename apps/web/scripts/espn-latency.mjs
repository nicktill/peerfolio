// Read-only ESPN latency logger. Polls public scoreboards and writes one JSON line each time a game's
// state changes (pre -> in -> post), with how late that was against the scheduled start. No picks, no DB,
// no keys. Output answers: how long after the scheduled start do we first see "in", how stale is a final,
// and (tennis) how often does a match start before its listed time.
//
//   node scripts/espn-latency.mjs --once                 one pass (CI)
//   node scripts/espn-latency.mjs --loop 30 --for 270    poll every 30 s for 270 s
//   flags: --leagues football/nfl,basketball/nba,tennis/atp,tennis/wta,mma/ufc
//          --out latency.jsonl  --state latency-state.json
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs"

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback)
}
const flag = (name) => process.argv.includes(`--${name}`)

const leagues = arg("leagues", "football/nfl,basketball/nba,tennis/atp,tennis/wta,mma/ufc").split(",")
const out = arg("out", "latency.jsonl")
const statePath = arg("state", "latency-state.json")
const intervalS = flag("once") ? 0 : Number(arg("loop", "30"))
const forS = Number(arg("for", "270"))

const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {}

// Flatten events and tennis groupings into competitions.
function competitions(board) {
  const rows = []
  for (const ev of board.events ?? []) {
    for (const c of ev.competitions ?? []) rows.push({ event: ev, c })
    for (const g of ev.groupings ?? []) for (const c of g.competitions ?? []) rows.push({ event: ev, c })
  }
  return rows
}

async function poll(league) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${league}/scoreboard`
  const t0 = Date.now()
  let res
  try {
    res = await fetch(url, { headers: { "user-agent": "peerfolio-latency-logger" }, signal: AbortSignal.timeout(15000) })
  } catch (e) {
    log({ kind: "error", league, error: String(e?.message ?? e) })
    return
  }
  const ms = Date.now() - t0
  if (!res.ok) return log({ kind: "error", league, status: res.status })
  const board = await res.json()
  const seenAt = new Date()
  for (const { event, c } of competitions(board)) {
    const id = `${league}:${c.id ?? event.id}`
    const phase = c.status?.type?.state ?? event.status?.type?.state ?? "unknown"
    const name = c.status?.type?.name ?? ""
    const prev = state[id]
    const sig = `${phase}|${name}|${c.status?.period ?? ""}`
    if (prev?.sig === sig) continue
    const scheduled = c.date ?? event.date
    state[id] = { sig, phase }
    log({
      kind: "transition",
      league,
      id,
      from: prev?.phase ?? null,
      to: phase,
      status: name,
      period: c.status?.period ?? null,
      clock: c.status?.displayClock ?? null,
      scheduled,
      // Positive: we saw the state this many seconds after the listed start. Negative on "in": started early.
      secondsAfterScheduled: scheduled ? Math.round((seenAt - new Date(scheduled)) / 1000) : null,
      // Honest only on the first pass of a run, when prev is null: then it is "already in this state when we looked".
      firstLook: prev == null,
      fetchMs: ms,
      cacheControl: res.headers.get("cache-control"),
      age: res.headers.get("age"),
      seenAt: seenAt.toISOString(),
    })
  }
}

function log(row) {
  appendFileSync(out, JSON.stringify(row) + "\n")
  console.log(JSON.stringify(row))
}

const end = Date.now() + forS * 1000
do {
  await Promise.all(leagues.map(poll))
  writeFileSync(statePath, JSON.stringify(state))
  if (!intervalS) break
  await new Promise((r) => setTimeout(r, intervalS * 1000))
} while (Date.now() < end)
