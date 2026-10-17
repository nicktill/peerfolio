import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { EXCHANGE_PUBLISH, planPublication } from "../lines.ts"
import { GAMMA_PAGE } from "../live/sources.ts"
import { americanToProb, HOUSE_MARGIN } from "../odds.ts"
import type { Sport } from "../types.ts"
import { EXCHANGE_ODDS, ExchangeCapError, ExchangeOddsProvider, MemoryCallCap, parseGammaGroups, planGames, type PmGameGroup } from "./polymarket-odds.ts"

const here = dirname(fileURLToPath(import.meta.url))
type Fixture = { sport: string; now: string; espn: { events: unknown[] }; gamma: any[]; clob: any[]; kalshi: { events: any[] } }
const load = (name: string): Fixture => JSON.parse(readFileSync(join(here, "fixtures", name), "utf8"))
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

/** A fetch that serves a fixture by URL. `tweak` may alter a response; `calls` records what was asked. */
function serve(fx: Fixture, opts: { clobStatus?: number[]; gammaPages?: unknown[][]; kalshiFail?: boolean } = {}) {
  const calls: string[] = []
  const clobStatus = [...(opts.clobStatus ?? [])]
  let gammaPage = 0
  const f = (async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    calls.push(url)
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
    if (url.includes("espn.com")) return json(fx.espn)
    if (url.includes("gamma-api")) return json(opts.gammaPages ? (opts.gammaPages[gammaPage++] ?? []) : fx.gamma)
    if (url.includes("clob.polymarket.com")) {
      const status = clobStatus.shift()
      if (status && status !== 200) return new Response("nope", { status })
      const want = new Set((JSON.parse(String(init?.body)) as { token_id: string }[]).map((x) => x.token_id))
      return json(fx.clob.filter((b) => want.has(b.asset_id)))
    }
    if (url.includes("kalshi")) return opts.kalshiFail ? new Response("down", { status: 500 }) : json(fx.kalshi)
    return new Response("unexpected " + url, { status: 404 })
  }) as typeof fetch
  return { f, calls }
}

const provider = (fx: Fixture, opts: Parameters<typeof serve>[1] = {}, extra: ConstructorParameters<typeof ExchangeOddsProvider>[0] = {}) => {
  const s = serve(fx, opts)
  const sleeps: number[] = []
  const p = new ExchangeOddsProvider({ fetch: s.f, sleep: async (ms) => void sleeps.push(ms), windowMs: 4 * 86_400_000, ...extra })
  return { p, calls: s.calls, sleeps }
}
const at = (fx: Fixture, ms = 2_000) => new Date(new Date(fx.now).getTime() + ms)

describe("exchange odds provider on recorded Polymarket, ESPN and Kalshi payloads", () => {
  it("prices NBA games from CLOB mids on the ESPN event, with home/away from ESPN", async () => {
    const fx = load("exchange-nba-2026-10-17.json")
    const { p } = provider(fx)
    const snap = await p.fetchOdds("nba", at(fx))
    assert.equal(snap.complete, true)
    const e = snap.events.find((x) => x.homeName === "Detroit Pistons")!
    assert.ok(e, "Celtics at Pistons is priced")
    assert.equal(e.awayName, "Boston Celtics")
    assert.equal(e.family, "espn")
    assert.match(e.externalId, /^\d+$/, "event id is ESPN's, so settlement matches it by id")
    assert.deepEqual(e.markets.map((m) => m.key).sort(), ["moneyline", "spread"].sort(), "a thin total is hidden, not guessed")
    const ml = e.markets.find((m) => m.key === "moneyline")!
    const homeMid = ml.outcomes.find((o) => o.selection === "home")!.quotes[0]!
    assert.ok(Math.abs(americanToProb(homeMid.price) - 0.485) < 0.02, "home fair is the Pistons' book mid, not the title's first team")
    assert.match(snap.notes!.join(" "), /hidden: total: book too thin/)
  })

  it("spreads are quoted for the home team and totals use the line nearest 50%", async () => {
    const fx = load("exchange-nba-2026-10-17.json")
    const { p } = provider(fx)
    const snap = await p.fetchOdds("nba", at(fx))
    const e = snap.events.find((x) => x.homeName === "New York Knicks")!
    const sp = e.markets.find((m) => m.key === "spread")!
    const [h, a] = [sp.outcomes.find((o) => o.selection === "home")!.quotes[0]!, sp.outcomes.find((o) => o.selection === "away")!.quotes[0]!]
    assert.equal(h.point, -(a.point as number), "away handicap mirrors home")
    assert.ok(Math.abs(americanToProb(h.price) + americanToProb(a.price) - 1) < 1e-9, "the two sides of one market are complements")
    const tot = e.markets.find((m) => m.key === "total")!
    const q = tot.outcomes[0]!.quotes[0]!
    assert.ok(q.point != null && q.point % 1 === 0.5)
    assert.ok(Math.abs(americanToProb(q.price) - 0.5) < EXCHANGE_ODDS.mainLineBand)
  })

  it("publishes through the normal pipeline: 2% margin, prices rounded against the player, one book is enough", async () => {
    const fx = load("exchange-nba-2026-10-17.json")
    const { p } = provider(fx)
    const now = at(fx)
    const snap = await p.fetchOdds("nba", now)
    // The games are ~3 days out: widen the window for this check only.
    const plan = planPublication(snap, now, new Set(), { ...EXCHANGE_PUBLISH, publishWindowMs: 5 * 86_400_000 })
    assert.ok(plan.drafts.length >= 6)
    for (const d of plan.drafts) {
      const implied = americanToProb(d.lines[0].price) + americanToProb(d.lines[1].price)
      assert.ok(implied >= 1 + HOUSE_MARGIN - 1e-9, `${d.marketKey} implied ${implied}`)
      for (const l of d.lines) assert.equal(Math.abs(l.price) % 5, 0)
    }
    // With the default (sportsbook) config the same snapshot publishes nothing: three books are required there.
    assert.equal(planPublication(snap, now, new Set(), { ...EXCHANGE_PUBLISH, consensus: { ...EXCHANGE_PUBLISH.consensus, minBooks: 3 }, publishWindowMs: 5 * 86_400_000 }).drafts.length, 0)
  })

  it("hides a market when its book is too wide, too thin, stuck, or outside the range", async () => {
    const base = load("exchange-nba-2026-10-17.json")
    const mlTokens = base.gamma.map((g) => JSON.parse(g.markets.find((m: any) => m.sportsMarketType === "moneyline").clobTokenIds) as string[])
    const run = async (mutate: (fx: Fixture, tokens: Set<string>) => void) => {
      const fx = clone(base)
      mutate(fx, new Set(mlTokens.flat()))
      const { p } = provider(fx)
      const snap = await p.fetchOdds("nba", at(fx))
      return { snap, mlCount: snap.events.filter((e) => e.markets.some((m) => m.key === "moneyline")).length }
    }
    const baseline = await run(() => {})
    assert.equal(baseline.mlCount, 3)
    const wide = await run((fx, tok) => fx.clob.filter((b) => tok.has(b.asset_id)).forEach((b) => (b.asks = b.asks.map((a: any) => ({ ...a, price: String(Number(a.price) + 0.1) })))))
    assert.equal(wide.mlCount, 0)
    assert.match(wide.snap.notes!.join(" "), /moneyline: book too wide x3/)
    const thin = await run((fx, tok) => fx.clob.filter((b) => tok.has(b.asset_id)).forEach((b) => ((b.bids[b.bids.length - 1] ?? {}).size = "5")))
    assert.equal(thin.mlCount, 0)
    const stuck = await run((fx, tok) => fx.clob.filter((b) => tok.has(b.asset_id)).forEach((b) => (b.timestamp = String(Number(b.timestamp) - 3_600_000))))
    assert.equal(stuck.mlCount, 0)
    assert.match(stuck.snap.notes!.join(" "), /book timestamp stuck/)
    const missing = await run((fx) => (fx.clob = []))
    assert.equal(missing.snap.events.length, 0)
  })

  it("a game with no moneyline market has none published; one not accepting orders is hidden", async () => {
    const fx = clone(load("exchange-nba-2026-10-17.json"))
    fx.gamma[0].markets = fx.gamma[0].markets.filter((m: any) => m.sportsMarketType !== "moneyline")
    fx.gamma[1].markets.forEach((m: any) => (m.acceptingOrders = false))
    const { p } = provider(fx)
    const snap = await p.fetchOdds("nba", at(fx))
    // game 0 has no moneyline so it cannot even be matched (its teams come from the moneyline): it is simply not offered
    assert.ok(!snap.events.some((e) => e.homeName === "Detroit Pistons"))
    assert.ok(!snap.events.some((e) => e.homeName === "New York Knicks"), "nothing accepting orders, nothing offered")
    assert.ok(snap.events.some((e) => e.homeName === "San Antonio Spurs"))
  })

  it("does not publish a game the exchange shows live, or one ESPN does not list as scheduled", async () => {
    const fx = clone(load("exchange-nba-2026-10-17.json"))
    fx.gamma[2].live = true
    const { p } = provider(fx)
    const snap = await p.fetchOdds("nba", at(fx))
    assert.ok(!snap.events.some((e) => e.homeName === "San Antonio Spurs"))
    const fx2 = clone(load("exchange-nba-2026-10-17.json"))
    ;(fx2.espn.events[0] as any).status.type = { name: "STATUS_IN_PROGRESS", state: "in", completed: false }
    ;(fx2.espn.events[0] as any).competitions[0].status.type = { name: "STATUS_IN_PROGRESS", state: "in", completed: false }
    const second = await provider(fx2).p.fetchOdds("nba", at(fx2))
    assert.equal(second.events.length, 2)
  })

  it("a game that matches no exchange game is left out and counted", async () => {
    const fx = clone(load("exchange-nba-2026-10-17.json"))
    fx.gamma = fx.gamma.slice(1)
    const snap = await provider(fx).p.fetchOdds("nba", at(fx))
    assert.equal(snap.events.length, 2)
    assert.match(snap.notes!.join(" "), /1 not matched/)
  })

  it("Kalshi disagreeing by more than the repricer's limit hides the moneyline; agreeing or absent leaves it", async () => {
    const base = load("exchange-nba-2026-10-17.json")
    const agree = await provider(base).p.fetchOdds("nba", at(base))
    assert.equal(agree.events.filter((e) => e.markets.some((m) => m.key === "moneyline")).length, 3)
    const fx = clone(base)
    const bos = fx.kalshi.events.find((e) => e.title === "Boston vs Detroit")!
    bos.markets[0].yes_bid_dollars = "0.7000"
    bos.markets[0].yes_ask_dollars = "0.7100"
    bos.markets[1].yes_bid_dollars = "0.2900"
    bos.markets[1].yes_ask_dollars = "0.3000"
    const snap = await provider(fx).p.fetchOdds("nba", at(fx))
    const e = snap.events.find((x) => x.homeName === "Detroit Pistons")!
    assert.ok(!e.markets.some((m) => m.key === "moneyline"))
    assert.match(snap.notes!.join(" "), /moneyline: sources disagree x1/)
    const down = await provider(base, { kalshiFail: true }).p.fetchOdds("nba", at(base))
    assert.equal(down.events.filter((x) => x.markets.some((m) => m.key === "moneyline")).length, 3)
    assert.match(down.notes!.join(" "), /kalshi: unavailable/)
  })

  it("covers NHL and NFL fixtures (puck line, whole-point NFL totals), and hides a moneyline priced outside the range", async () => {
    const nhl = load("exchange-nhl-2026-10-17.json")
    const a = await provider(nhl, {}, { windowMs: 86_400_000 }).p.fetchOdds("nhl", at(nhl))
    assert.ok(a.events.length >= 3)
    assert.ok(a.events.every((e) => e.startsAt.getTime() > at(nhl).getTime()))
    const nfl = load("exchange-nfl-2026-10-17.json")
    const b = await provider(nfl, {}, { windowMs: 86_400_000 }).p.fetchOdds("nfl", at(nfl))
    const rams = b.events.find((e) => e.homeName === "Los Angeles Rams")
    assert.ok(rams && !rams.markets.some((m) => m.key === "moneyline"), "a -13.5 favourite's moneyline is outside the repricing range")
    assert.match(b.notes!.join(" "), /price outside range/)
  })
})

describe("exchange provider request hygiene", () => {
  it("retries 429 and 5xx with backoff and then succeeds", async () => {
    const fx = load("exchange-nba-2026-10-17.json")
    const { p, sleeps, calls } = provider(fx, { clobStatus: [429, 503] })
    const snap = await p.fetchOdds("nba", at(fx))
    assert.equal(snap.complete, true)
    assert.equal(calls.filter((u) => u.includes("clob")).length, 3)
    assert.deepEqual(sleeps, [EXCHANGE_ODDS.backoffMs, EXCHANGE_ODDS.backoffMs * 2])
  })

  it("a book request that keeps failing makes the snapshot incomplete (absence proves nothing) and cools the host down", async () => {
    const fx = load("exchange-nba-2026-10-17.json")
    let t = 0
    const { p, calls } = provider(fx, { clobStatus: [500, 500, 500] }, { clock: () => t })
    const snap = await p.fetchOdds("nba", at(fx))
    assert.equal(snap.complete, false)
    assert.equal(snap.events.length, 0)
    const clobBefore = calls.filter((u) => u.includes("clob")).length
    // Inside the cooldown no further request goes to that host; a later run asks again.
    const again = await p.fetchOdds("nba", at(fx, 5_000))
    assert.equal(calls.filter((u) => u.includes("clob")).length, clobBefore)
    assert.equal(again.complete, false)
    t += EXCHANGE_ODDS.cooldownMs + 1
    const later = await p.fetchOdds("nba", at(fx, 10_000))
    assert.equal(later.complete, true)
    assert.equal(later.events.length, 3)
  })

  it("a Gamma failure fails the sport instead of publishing from a partial listing", async () => {
    const fx = load("exchange-nba-2026-10-17.json")
    const f = (async (u: unknown) => (String(u).includes("gamma") ? new Response("x", { status: 502 }) : serve(fx).f(u as string))) as typeof fetch
    const p = new ExchangeOddsProvider({ fetch: f, sleep: async () => {}, windowMs: 4 * 86_400_000 })
    await assert.rejects(() => p.fetchOdds("nba", at(fx)), /gamma 502/)
  })

  it("enforces the per-sport daily request cap and counts every request", async () => {
    const fx = load("exchange-nba-2026-10-17.json")
    const { p } = provider(fx, {}, { cap: new MemoryCallCap(3) })
    await assert.rejects(() => p.fetchOdds("nba", at(fx)), ExchangeCapError)
    const cap = new MemoryCallCap(1000)
    const ok = provider(fx, {}, { cap })
    await ok.p.fetchOdds("nba", at(fx))
    const used = ok.calls.length
    assert.ok(used >= 6 && used <= 12, `a normal fetch uses ${used} requests`)
  })

  it("pages Gamma until a short page, within the page limit", async () => {
    const fx = load("exchange-nba-2026-10-17.json")
    const filler = Array.from({ length: GAMMA_PAGE }, (_, i) => ({ slug: `nba-xxx-yyy-2026-12-${String((i % 28) + 1).padStart(2, "0")}-props`, markets: [] }))
    const { p, calls } = provider(fx, { gammaPages: [filler, fx.gamma] })
    const snap = await p.fetchOdds("nba", at(fx))
    assert.equal(calls.filter((u) => u.includes("gamma-api")).length, 2)
    assert.ok(calls.some((u) => u.includes(`offset=${GAMMA_PAGE}`)))
    assert.equal(snap.events.length, 3)
  })

  it("asks only for the window and never for sports without a game series; empty schedule costs no Gamma call", async () => {
    const fx = load("exchange-nba-2026-10-17.json")
    const { p, calls } = provider(fx)
    const tennis = await p.fetchOdds("tennis", at(fx))
    assert.equal(tennis.events.length, 0)
    assert.equal(calls.length, 0)
    const none = clone(fx)
    none.espn = { events: [] }
    const q = provider(none)
    assert.equal((await q.p.fetchOdds("nba", at(none))).events.length, 0)
    assert.equal(q.calls.filter((u) => u.includes("gamma")).length, 0)
    assert.match(q.calls.find((u) => u.includes("espn"))!, /scoreboard\?dates=\d{8}/)
  })

  it("hasGameWithin answers from the ESPN schedule and is null when ESPN fails", async () => {
    const fx = load("exchange-nba-2026-10-17.json")
    assert.equal(await provider(fx).p.hasGameWithin("nba", at(fx)), true)
    assert.equal(await provider(fx, {}, { windowMs: 3_600_000 }).p.hasGameWithin("nba", at(fx)), false)
    const broken = new ExchangeOddsProvider({ fetch: (async () => new Response("x", { status: 500 })) as typeof fetch, sleep: async () => {} })
    assert.equal(await broken.hasGameWithin("nba" as Sport, new Date()), null)
    assert.equal(await provider(fx).p.hasGameWithin("tennis", at(fx)), false)
  })
})

describe("Gamma parsing", () => {
  it("folds the more-markets event into its game and ignores sub-events, props and malformed markets", () => {
    const mk = (type: string, q: string, extra: object = {}) => ({ sportsMarketType: type, question: q, outcomes: '["A","B"]', clobTokenIds: '["1","2"]', ...extra })
    const groups = parseGammaGroups([
      { slug: "mls-aaa-bbb-2026-10-17", title: "A vs. B", startTime: "2026-10-18T00:30:00Z", markets: [mk("moneyline", "A vs. B")] },
      { slug: "mls-aaa-bbb-2026-10-17-more-markets", title: "A vs. B - More Markets", markets: [mk("spreads", "Spread: A (-1.5)", { line: -1.5 }), mk("spreads", "Spread: A (-2.5)", { line: -1.5 }), mk("totals", "A vs. B: O/U 2.5", { line: 2.5 })] },
      { slug: "mls-aaa-bbb-2026-10-17-exact-score", title: "x", markets: [mk("soccer_exact_score", "x")] },
      { slug: "mls-aaa-bbb-2026-10-17-player-props", title: "x", markets: [mk("moneyline", "x")] },
      { slug: "mls-ccc-ddd-2026-10-17-more-markets", title: "orphan", markets: [mk("totals", "o", { line: 1.5 })] },
    ])
    assert.equal(groups.length, 1)
    assert.deepEqual(groups[0]!.markets.map((m) => m.type), ["moneyline", "spreads", "totals"])
  })
})

describe("MLS three-way moneyline from three Yes/No markets, spreads and totals from the more-markets event", () => {
  const fx = () => load("exchange-mls-2026-10-17.json")
  const run = (f: Fixture, extra: ConstructorParameters<typeof ExchangeOddsProvider>[0] = {}) => provider(f, {}, { windowMs: 86_400_000, ...extra }).p.fetchOdds("mls", at(f))

  it("prices home / draw / away that add up to one, with ESPN's names and home/away", async () => {
    const f = fx()
    const snap = await run(f)
    const e = snap.events.find((x) => x.homeName === "Atlanta United FC")!
    assert.ok(e)
    assert.equal(e.awayName, "Inter Miami CF")
    const ml = e.markets.find((m) => m.key === "moneyline")!
    assert.deepEqual(ml.outcomes.map((o) => o.selection), ["home", "draw", "away"])
    const fair = ml.outcomes.map((o) => americanToProb(o.quotes[0]!.price))
    assert.ok(Math.abs(fair[0]! + fair[1]! + fair[2]! - 1) < 1e-9)
    // Atlanta is the weaker home side in the recorded book (about 28%), Miami about 50%.
    assert.ok(fair[0]! < fair[2]!)
    assert.ok(fair[1]! > 0.15 && fair[1]! < 0.3)
  })

  it("joins spreads and totals from the -more-markets event to the same game", async () => {
    const snap = await run(fx())
    const e = snap.events.find((x) => x.homeName === "Atlanta United FC")!
    assert.deepEqual(e.markets.map((m) => m.key).sort(), ["moneyline", "spread", "total"])
    const sp = e.markets.find((m) => m.key === "spread")!
    assert.equal(sp.outcomes[0]!.quotes[0]!.point, -(sp.outcomes[1]!.quotes[0]!.point as number))
  })

  it("matches Red Bull New York to the exchange's New York Red Bulls, and hides a thin three-way moneyline while keeping the rest", async () => {
    const snap = await run(fx())
    const e = snap.events.find((x) => x.homeName === "Red Bull New York")!
    assert.ok(e, "alias matches")
    assert.ok(!e.markets.some((m) => m.key === "moneyline"))
    assert.match(snap.notes!.join(" "), /moneyline: polymarket book too (thin|wide)/)
  })

  it("an ESPN game with no exchange game is left out; one unusable leg hides the whole moneyline", async () => {
    const f = fx()
    const snap = await run(f)
    assert.match(snap.notes!.join(" "), /1 not matched/)
    const g = clone(f)
    const ev = g.gamma.find((x) => x.slug === "mls-atl-mia-2026-10-17")!
    const draw = ev.markets.find((m: any) => /^Draw/.test(m.groupItemTitle))
    draw.acceptingOrders = false
    const after = await run(g)
    const atl = after.events.find((x) => x.homeName === "Atlanta United FC")!
    assert.ok(!atl.markets.some((m) => m.key === "moneyline"))
    assert.match(after.notes!.join(" "), /not accepting orders/)
  })

  it("publishes a three-way market through the normal pipeline: 2% margin over three sides, rounded against the player", async () => {
    const f = fx()
    const now = at(f)
    const snap = await run(f)
    const plan = planPublication(snap, now, new Set(), EXCHANGE_PUBLISH)
    const d = plan.drafts.find((x) => x.kind === "moneyline" && x.externalEventId === snap.events.find((e) => e.homeName === "Atlanta United FC")!.externalId)!
    assert.deepEqual(d.lines.map((l) => l.selection), ["home", "draw", "away"])
    assert.equal(d.fairs.length, 3)
    assert.ok(Math.abs(d.fairs.reduce((a, b) => a + b, 0) - 1) < 1e-9)
    const implied = d.lines.reduce((s, l) => s + americanToProb(l.price), 0)
    assert.ok(implied >= 1 + HOUSE_MARGIN - 1e-9, `implied ${implied}`)
    for (const l of d.lines) assert.equal(Math.abs(l.price) % 5, 0)
  })

  it("a Kalshi draw price far from Polymarket's hides the moneyline", async () => {
    const f = clone(fx())
    const k = f.kalshi.events.find((e: any) => /Atlanta/.test(e.title))!
    // A coherent triple (adds to 1) whose draw is far from Polymarket's: a cross-check that disagrees, not one that is merely broken.
    const set = (re: RegExp, bid: string, ask: string) => {
      const m = k.markets.find((x: any) => re.test(x.yes_sub_title))
      m.yes_bid_dollars = bid
      m.yes_ask_dollars = ask
    }
    set(/atlanta/i, "0.2000", "0.2100")
    set(/miami/i, "0.4400", "0.4500")
    set(/tie/i, "0.3400", "0.3500")
    const snap = await run(f)
    const atl = snap.events.find((x) => x.homeName === "Atlanta United FC")!
    assert.ok(!atl.markets.some((m) => m.key === "moneyline"))
    assert.match(snap.notes!.join(" "), /sources disagree/)
  })
})

describe("college football matching (Polymarket titles carry the school only)", () => {
  const start = new Date("2026-10-17T23:00:00Z")
  const group = (a: string, h: string): PmGameGroup => ({
    slug: "cfb-x-2026-10-17", title: `${a} vs. ${h}`, startsAt: start, live: false, ended: false,
    markets: [{ type: "moneyline", question: `${a} vs. ${h}`, groupTitle: "Moneyline", outcomes: [a, h], tokens: ["t1", "t2"], yesToken: null, line: null, bid: 0.3, ask: 0.31, liquidity: 9000, acceptingOrders: true, updatedAt: start }],
  })
  const row = (a: string, h: string, aShort?: string, hShort?: string) =>
    ({ source: "espn", family: "espn", externalId: "1", awayName: a, homeName: h, awayShort: aShort, homeShort: hShort, startsAt: start, status: "scheduled", homeScore: null, awayScore: null }) as const
  const now = new Date("2026-10-17T20:00:00Z")

  it("matches by ESPN's school name when the full name adds a nickname, keeping ESPN's home/away", () => {
    const r = planGames("cfb", [row("TCU Horned Frogs", "Baylor Bears", "TCU", "Baylor")], [group("TCU", "Baylor")], now)
    assert.equal(r.games.length, 1)
    assert.equal(r.games[0]!.homeIndex, 1)
  })
  it("matches Miami (FL) to ESPN's Miami, and never to Miami (OH)", () => {
    assert.equal(planGames("cfb", [row("Florida State Seminoles", "Miami Hurricanes", "Florida State", "Miami")], [group("Florida State", "Miami (FL)")], now).games.length, 1)
    assert.equal(planGames("cfb", [row("Akron Zips", "Miami (OH) RedHawks", "Akron", "Miami (OH)")], [group("Akron", "Miami (FL)")], now).games.length, 0)
  })
  it("does not use school names for other sports or accept a city-only prefix", () => {
    assert.equal(planGames("nfl", [row("TCU Horned Frogs", "Baylor Bears", "TCU", "Baylor")], [group("TCU", "Baylor")], now).games.length, 0)
    assert.equal(planGames("cfb", [row("Washington State Cougars", "Oregon State Beavers", "Washington State", "Oregon State")], [group("Washington", "Oregon")], now).games.length, 0)
  })
})

describe("gate misses are held, not withdrawn", () => {
  it("assemble reports a gate-hidden market in `held` so the guard does not freeze it", async () => {
    const fx = load("exchange-nba-2026-10-17.json")
    const { p } = provider(fx)
    const snap = await p.fetchOdds("nba", at(fx))
    assert.ok(Array.isArray(snap.held))
    // The fixture hides a thin total on at least one game: that market is held, not silently absent.
    assert.ok(snap.held!.some((k) => k.endsWith("::total|")), JSON.stringify(snap.held))
  })
  it("a truncated Gamma listing makes the snapshot incomplete", async () => {
    const fx = load("exchange-nba-2026-10-17.json")
    const page = Array.from({ length: GAMMA_PAGE }, () => fx.gamma[0])
    const { p } = provider(fx, { gammaPages: Array.from({ length: EXCHANGE_ODDS.maxPages }, () => page) })
    const snap = await p.fetchOdds("nba", at(fx))
    assert.equal(snap.complete, false)
  })
})
