import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { QuoteInsert } from "./store.ts"
import type { LiveGameState } from "./types.ts"
import { cycleFailed } from "./health.ts"
import { BACKOFF_MS, newWorkerState, runTick, type WorkerDeps } from "./worker.ts"

const NOW = new Date("2026-10-20T20:00:00Z")
const plus = (ms: number) => new Date(NOW.getTime() + ms)

const slate = [
  { id: "ev-bos", externalId: "x1", sport: "nba", status: "scheduled", startsAt: new Date("2026-10-20T19:00:00Z"), homeName: "Boston Celtics", awayName: "Detroit Pistons" },
  { id: "ev-phi", externalId: "x2", sport: "nba", status: "scheduled", startsAt: new Date("2026-10-20T19:30:00Z"), homeName: "New York Knicks", awayName: "Philadelphia 76ers" },
]

const gammaEvent = (slug: string, a: string, b: string, tokens: [string, string], start: string, score: string) => ({
  slug,
  title: `${a} vs. ${b}`,
  live: true,
  ended: false,
  score,
  period: "Q2",
  elapsed: "05:12",
  startTime: start,
  markets: [{ sportsMarketType: "moneyline", outcomes: JSON.stringify([a, b]), clobTokenIds: JSON.stringify(tokens), acceptingOrders: true }],
})

function harness(over: Partial<WorkerDeps> = {}) {
  const calls: string[] = []
  const quotes: QuoteInsert[] = []
  const states = new Map<string, LiveGameState>()
  let books = 0.55
  const deps: WorkerDeps = {
    store: {
      loadSlate: async () => slate,
      insertQuotes: async (rows) => void quotes.push(...rows),
      upsertState: async (id, s) => void states.set(id, s),
    },
    getJson: async (url) => {
      calls.push(url)
      if (url.includes("gamma-api")) {
        return [
          gammaEvent("nba-det-bos", "Pistons", "Celtics", ["t-det", "t-bos"], "2026-10-20T19:00:00Z", "50-54"),
          gammaEvent("nba-phi-nyk", "76ers", "Knicks", ["t-phi", "t-nyk"], "2026-10-20T19:30:00Z", "20-22"),
        ]
      }
      if (url.includes("kalshi")) return { events: [] }
      if (url.includes("espn")) return { events: [] }
      throw new Error(`unexpected ${url}`)
    },
    postJson: async (url, body) => {
      calls.push(`POST ${url}`)
      const ids = (body as { token_id: string }[]).map((b) => b.token_id)
      const book = (id: string, mid: number) => ({ asset_id: id, timestamp: String(NOW.getTime() - 500), bids: [{ price: String(mid - 0.01) }], asks: [{ price: String(mid + 0.01) }] })
      return ids.map((id) => book(id, id === "t-bos" || id === "t-nyk" ? books : 1 - books))
    },
    ...over,
  }
  return { deps, calls, quotes, states, setBook: (m: number) => void (books = m) }
}

describe("live odds worker cycle", () => {
  it("makes a constant number of upstream calls for a whole slate, not one per game", async () => {
    const h = harness()
    await runTick(h.deps, newWorkerState(), NOW)
    const gamma = h.calls.filter((c) => c.includes("gamma-api")).length
    const books = h.calls.filter((c) => c.startsWith("POST") && c.includes("/books")).length
    assert.equal(gamma, 1)
    assert.equal(books, 1)
  })

  it("writes oriented quotes and state per game", async () => {
    const h = harness()
    await runTick(h.deps, newWorkerState(), NOW)
    const bos = h.quotes.filter((q) => q.eventId === "ev-bos")
    assert.equal(bos.length, 2)
    const home = bos.find((q) => q.selection === "home")!
    assert.equal(home.source, "polymarket")
    assert.ok(Math.abs(home.mid! - 0.55) < 1e-9) // Celtics (our home) token t-bos
    assert.equal(h.states.get("ev-bos")!.homeScore, 54) // "50-54" is Pistons-Celtics
    assert.equal(h.states.get("ev-bos")!.awayScore, 50)
    assert.equal(h.states.get("ev-bos")!.status, "live")
  })

  it("writes a row every tick, so the newest row is never more than one tick old", async () => {
    const h = harness()
    const st = newWorkerState()
    await runTick(h.deps, st, NOW)
    const first = h.quotes.length
    await runTick(h.deps, st, plus(10_000))
    assert.equal(h.quotes.length, first * 2)
  })

  it("bookkeeping advances only after the insert succeeded (a failed write is retried next tick)", async () => {
    const h = harness()
    const st = newWorkerState()
    let fail = true
    const insert = h.deps.store.insertQuotes
    h.deps.store.insertQuotes = async (rows) => {
      if (fail) throw new Error("db down")
      return insert(rows)
    }
    await assert.rejects(runTick(h.deps, st, NOW), /db down/)
    assert.equal(st.lastWrite.size, 0)
    fail = false
    await runTick(h.deps, st, plus(1_000))
    assert.equal(h.quotes.length, 4)
  })

  it("logs a cycle line, orientation inputs, and book clocks as structured events", async () => {
    const h = harness()
    const lines: { level: string; ev: string; f: Record<string, unknown> }[] = []
    h.deps.emit = (level, ev, f) => void lines.push({ level, ev, f: f ?? {} })
    const r = await runTick(h.deps, newWorkerState(), NOW)
    assert.equal(r.matched, 2)
    assert.equal(r.unmatched.length, 0)
    const cycle = lines.find((l) => l.ev === "live.cycle")!
    assert.equal(cycle.level, "info")
    assert.equal((cycle.f.sources as Record<string, { ok: number }>).polymarket!.ok, 2)
    assert.equal((cycle.f.rows as { written: number }).written, 4)
    const o = lines.find((l) => l.ev === "live.orientation" && l.f.eventId === "ev-bos")!
    assert.equal(o.f.scoreRaw, "50-54")
    assert.deepEqual(o.f.interpreted, { home: 54, away: 50 })
    assert.equal(o.f.feedHomeIndex, 1)
    assert.ok(lines.some((l) => l.ev === "live.book_clock"))
    // Every line serialises to one line of JSON without huge text.
    for (const l of lines) assert.ok(JSON.stringify(l).length < 2000)
  })

  it("reports unmatched games with a reason, and a failed cycle as an error", async () => {
    const h = harness()
    const lines: { level: string; ev: string; f: Record<string, unknown> }[] = []
    h.deps.emit = (level, ev, f) => void lines.push({ level, ev, f: f ?? {} })
    h.deps.getJson = async (url) => {
      if (url.includes("gamma-api")) return [gammaEvent("nba-lal-gsw", "Lakers", "Warriors", ["a", "b"], "2026-10-20T19:00:00Z", "1-0")]
      return { events: [] }
    }
    const r = await runTick(h.deps, newWorkerState(), NOW)
    assert.equal(r.unmatched.length, 2)
    assert.equal(r.unmatched[0]!.reason, "no_name_match")
    assert.ok(lines.some((l) => l.ev === "live.no_quotes" && l.level === "warn"))
    assert.equal(lines.find((l) => l.ev === "live.cycle")!.level, "warn")

    const down = harness()
    const l2: { level: string; ev: string }[] = []
    down.deps.emit = (level, ev) => void l2.push({ level, ev })
    down.deps.getJson = async () => {
      throw new Error("503 gamma")
    }
    const r2 = await runTick(down.deps, newWorkerState(), NOW)
    assert.equal(cycleFailed({ threw: false, slate: r2.slate, okCalls: r2.okCalls, failCalls: r2.failCalls, skippedBackoff: r2.skippedBackoff }), true)
    assert.equal(r2.unmatched[0]!.reason, "polymarket_unavailable")
    assert.ok(l2.some((l) => l.ev === "live.backoff_start"))
    assert.equal(l2.find((l) => l.ev === "live.cycle")!.level, "error")
  })

  it("logs backoff ending, and low confidence / mismatch from what a viewer would see", async () => {
    const h = harness()
    const lines: { ev: string }[] = []
    h.deps.emit = (_l, ev) => void lines.push({ ev })
    const st = newWorkerState()
    st.backoffUntil.set("kalshi", NOW.getTime() - 1)
    h.setBook(0.55)
    await runTick(h.deps, st, NOW)
    assert.ok(lines.some((l) => l.ev === "live.backoff_end"))
    // A wide book is low confidence and says so.
    const wide = harness()
    const l3: { ev: string }[] = []
    wide.deps.emit = (_l, ev) => void l3.push({ ev })
    wide.deps.postJson = async (_u, body) =>
      (body as { token_id: string }[]).map(({ token_id }) => {
        const mid = token_id === "t-bos" || token_id === "t-nyk" ? 0.55 : 0.45
        return { asset_id: token_id, timestamp: String(NOW.getTime() - 500), bids: [{ price: String(mid - 0.06) }], asks: [{ price: String(mid + 0.06) }] }
      })
    await runTick(wide.deps, newWorkerState(), NOW)
    assert.ok(l3.some((l) => l.ev === "live.low_confidence"))
  })

  it("applies the Kalshi time gate: an event that ends before our start is not our game", async () => {
    const h = harness()
    const kalshi = (end: string) => ({ events: [{ event_ticker: "K1", title: "Boston vs Detroit", markets: [{ ticker: "a", yes_sub_title: "Boston", yes_bid_dollars: "0.6", yes_ask_dollars: "0.62", expected_expiration_time: end }, { ticker: "b", yes_sub_title: "Detroit", yes_bid_dollars: "0.38", yes_ask_dollars: "0.4", expected_expiration_time: end }] }] })
    const run = async (end: string) => {
      const x = harness()
      const orig = x.deps.getJson
      x.deps.getJson = async (u) => (u.includes("kalshi") ? kalshi(end) : orig(u))
      await runTick(x.deps, newWorkerState(), NOW)
      return x.quotes.filter((q) => q.source === "kalshi").length
    }
    assert.equal(await run("2026-10-20T22:00:00Z"), 2)
    assert.equal(await run("2026-10-19T22:00:00Z"), 0) // yesterday's market
    assert.equal(h.quotes.length, 0)
  })

  it("an idle slate makes no upstream call at all", async () => {
    const h = harness()
    h.deps.store.loadSlate = async () => []
    await runTick(h.deps, newWorkerState(), NOW)
    assert.deepEqual(h.calls, [])
  })

  it("a failing source backs off instead of hammering, and the cycle survives", async () => {
    const h = harness()
    let gammaHits = 0
    h.deps.getJson = async (url) => {
      if (url.includes("gamma-api")) {
        gammaHits++
        throw new Error("503")
      }
      return { events: [] }
    }
    const st = newWorkerState()
    await runTick(h.deps, st, NOW)
    await runTick(h.deps, st, plus(10_000))
    assert.equal(gammaHits, 1) // not retried inside the backoff window
    assert.equal(st.stats.errors, 1)
    await runTick(h.deps, st, plus(BACKOFF_MS + 1_000))
    assert.equal(gammaHits, 2)
    assert.equal(h.quotes.length, 0)
  })

  it("prefers a fresh WebSocket book over the REST call", async () => {
    const h = harness()
    const ws = new Map([
      ["t-bos", { bid: 0.7, ask: 0.72, ts: plus(-1_000) }],
      ["t-det", { bid: 0.27, ask: 0.29, ts: plus(-1_000) }],
      ["t-nyk", { bid: 0.5, ask: 0.52, ts: plus(-60_000) }], // too old: REST
      ["t-phi", { bid: 0.46, ask: 0.48, ts: plus(-60_000) }],
    ])
    h.deps.wsBooks = ws
    await runTick(h.deps, newWorkerState(), NOW)
    const bos = h.quotes.find((q) => q.eventId === "ev-bos" && q.selection === "home")!
    assert.equal(bos.bid, 0.7)
    const phi = h.quotes.find((q) => q.eventId === "ev-phi" && q.selection === "home")!
    assert.ok(Math.abs(phi.bid! - 0.54) < 1e-9) // came from REST (0.55 - 0.01)
  })

  it("falls back to ESPN for state and win probability when Polymarket has no match", async () => {
    const h = harness()
    const orig = h.deps.getJson
    h.deps.getJson = async (url) => {
      if (url.includes("gamma-api")) return []
      if (url.includes("scoreboard")) {
        return { events: [{ id: "401", date: "2026-10-20T19:00Z", status: { period: 2, displayClock: "3:00", type: { state: "in" } }, competitions: [{ competitors: [{ homeAway: "home", score: "30", team: { displayName: "Boston Celtics" } }, { homeAway: "away", score: "28", team: { displayName: "Detroit Pistons" } }] }] }] }
      }
      if (url.includes("summary")) return { winprobability: [{ homeWinPercentage: 0.64 }] }
      return orig(url)
    }
    await runTick(h.deps, newWorkerState(), NOW)
    assert.equal(h.states.get("ev-bos")!.source, "espn")
    const q = h.quotes.find((x) => x.eventId === "ev-bos")!
    assert.equal(q.source, "espn")
    assert.equal(q.mid, 0.64)
  })

  it("only ever writes to the live tables' store: nothing on the store can touch picks", () => {
    const h = harness()
    assert.deepEqual(Object.keys(h.deps.store).sort(), ["insertQuotes", "loadSlate", "upsertState"])
  })
})
