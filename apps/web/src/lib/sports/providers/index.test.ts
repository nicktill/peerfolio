import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { MemoryUsageStore } from "../credit-budget.ts"
import { SPORTS } from "../types.ts"
import { buildExchangeOdds, buildOddsProvider, buildResultsProviders, enabledSports, oddsSource, publishMode } from "./index.ts"

const KEYS = ["SPORTS_MOCK", "SPORTS_ODDS_SOURCE", "THE_ODDS_API_KEY", "ODDS_API_KEY", "ESPN_RESULTS_ENABLED", "SPORTS_ENABLED_SPORTS"]
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
const env = (vars: Record<string, string | undefined>) => {
  for (const k of KEYS) delete process.env[k]
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v
}
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe("odds source selection", () => {
  it("defaults to the free exchange source, with or without an Odds API key", () => {
    env({})
    assert.equal(oddsSource(), "exchange")
    assert.equal(publishMode(), "exchange")
    assert.equal(buildOddsProvider(new MemoryUsageStore()).name, "exchange")
    env({ THE_ODDS_API_KEY: "present-but-unused" })
    assert.equal(publishMode(), "exchange")
    assert.equal(buildOddsProvider(new MemoryUsageStore()).name, "exchange")
  })
  it("uses the Odds API only when asked for explicitly, and still needs its key", () => {
    env({ SPORTS_ODDS_SOURCE: "odds-api", THE_ODDS_API_KEY: "k" })
    assert.equal(publishMode(), "odds-api")
    assert.notEqual(buildOddsProvider(new MemoryUsageStore()).name, "exchange")
    env({ SPORTS_ODDS_SOURCE: "odds-api" })
    assert.throws(() => buildOddsProvider(new MemoryUsageStore()), /No sports odds provider/)
    env({ SPORTS_ODDS_SOURCE: "garbage" })
    assert.equal(oddsSource(), "exchange")
  })
  it("mock mode wins over both", () => {
    env({ SPORTS_MOCK: "1", SPORTS_ODDS_SOURCE: "odds-api", THE_ODDS_API_KEY: "k" })
    assert.equal(publishMode(), "mock")
    assert.equal(buildOddsProvider(new MemoryUsageStore()).name, "mock")
  })
  it("exchange mode never touches the credit store", async () => {
    env({ THE_ODDS_API_KEY: "k" })
    const usage = new MemoryUsageStore()
    let touched = 0
    const spy = { usage: async (...a: Parameters<typeof usage.usage>) => (touched++, usage.usage(...a)), record: async (...a: Parameters<typeof usage.record>) => void touched++ }
    const provider = buildOddsProvider(spy)
    const fetchFn = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify({ events: [] }))) as typeof fetch
    try {
      await provider.fetchOdds("nba", new Date())
    } finally {
      globalThis.fetch = fetchFn
    }
    assert.equal(touched, 0)
  })
  it("builds the exchange provider with its schedule check for the cron", () => {
    env({})
    const { exchange, provider } = buildExchangeOdds()
    assert.equal(typeof exchange.hasGameWithin, "function")
    assert.equal(provider.name, "exchange")
  })
})

describe("results sources", () => {
  it("exchange mode is free: ESPN only, no metered vendor even with a key", () => {
    env({ THE_ODDS_API_KEY: "k" })
    const r = buildResultsProviders()
    assert.deepEqual(r.map((p) => p.name), ["espn"])
    assert.ok(r.every((p) => !p.metered))
    env({ ESPN_RESULTS_ENABLED: "0" })
    assert.deepEqual(buildResultsProviders(), [])
  })
  it("odds-api mode keeps the metered scores endpoint and ESPN stays opt-in", () => {
    env({ SPORTS_ODDS_SOURCE: "odds-api", THE_ODDS_API_KEY: "k" })
    assert.ok(buildResultsProviders().some((p) => p.metered))
    assert.ok(!buildResultsProviders().some((p) => p.name === "espn"))
    env({ SPORTS_ODDS_SOURCE: "odds-api", THE_ODDS_API_KEY: "k", ESPN_RESULTS_ENABLED: "1" })
    assert.ok(buildResultsProviders().some((p) => p.name === "espn"))
  })
})

describe("enabled sports", () => {
  it("is every sport unless SPORTS_ENABLED_SPORTS narrows it", () => {
    env({})
    assert.deepEqual(enabledSports(SPORTS), [...SPORTS])
    env({ SPORTS_ENABLED_SPORTS: "nba, NHL ,bogus" })
    assert.deepEqual(enabledSports(SPORTS), ["nba", "nhl"])
  })
})
