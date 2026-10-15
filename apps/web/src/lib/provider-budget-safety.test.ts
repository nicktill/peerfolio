import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { budgetFor, type Budget, type ProviderName } from "./provider-fetch.ts"
import { BUDGET_DEFAULTS } from "./provider-stats-core.ts"

/**
 * A real 429 means a provider's allowance was exceeded, and fixing one can mean
 * rotating a key. These tests check the token-bucket ARITHMETIC (a model of the refill
 * and grant rule in provider-budget.ts, replayed under random bursts and idle gaps)
 * against each provider's allowance. They do not exercise the production Postgres
 * limiter itself, so they prove the numbers are safe, not that the limiter keeps to them.
 */

const PER_MINUTE = { finnhub: 60, alpaca: 200, massive: 5 } as const

/** Grant times (ms) of a token bucket under random traffic: bursts of attempts, then long gaps. Mirrors the refill and grant rule in provider-budget.ts. */
function simulate({ perMinute, burst }: Budget, durationMs: number, seed: number, skewMs = 0): number[] {
  let state = seed
  const random = () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32
  let tokens = burst
  let last = 0
  let t = 0
  const grants: number[] = []
  while (t < durationMs) {
    t += random() < 0.1 ? random() * 120_000 : random() * 2_000
    tokens = Math.min(burst, tokens + (perMinute / 60_000) * (t - last))
    last = t
    if (tokens >= 1) {
      tokens -= 1
      // Skew: the request reaches the provider a little after its token was taken.
      grants.push(t + random() * skewMs)
    }
  }
  return grants.sort((a, b) => a - b)
}

/** The most grants inside any window of `windowMs`. */
function busiest(grants: number[], windowMs: number): number {
  let most = 0
  let from = 0
  for (let i = 0; i < grants.length; i++) {
    while (grants[i]! - grants[from]! >= windowMs) from++
    most = Math.max(most, i - from + 1)
  }
  return most
}

describe("token-bucket simulation of the budget defaults (arithmetic only, not the Postgres limiter)", () => {
  for (const provider of ["finnhub", "alpaca", "massive"] as const) {
    it(`${provider}: in the simulation no 60 second window exceeds burst + perMinute, which is under ${PER_MINUTE[provider]}`, () => {
      const budget = BUDGET_DEFAULTS[provider]
      assert.ok(budget.burst + budget.perMinute < PER_MINUTE[provider])
      for (let seed = 1; seed <= 20; seed++) {
        assert.ok(busiest(simulate(budget, 3_600_000, seed), 60_000) <= budget.burst + budget.perMinute)
      }
    })

    it(`${provider}: in the simulation, still under the allowance when grants reach the provider up to 1.5 s late`, () => {
      const budget = BUDGET_DEFAULTS[provider]
      for (let seed = 1; seed <= 20; seed++) {
        assert.ok(busiest(simulate(budget, 3_600_000, seed, 1_500), 60_000) < PER_MINUTE[provider])
      }
    })
  }

  it("tiingo: in the simulation, stays under 50 an hour and 1,000 a day", () => {
    const grants = simulate(BUDGET_DEFAULTS.tiingo, 3 * 86_400_000, 7)
    assert.ok(busiest(grants, 3_600_000) < 50)
    assert.ok(busiest(grants, 86_400_000) < 1_000)
  })
})

describe("budgetFor falls back to the defaults for overrides that would reach a documented allowance on any timescale", () => {
  const providers: ProviderName[] = ["finnhub", "alpaca", "massive", "tiingo"]

  it("falls back to the defaults for an override at or over the allowance", () => {
    assert.deepEqual(budgetFor("finnhub", { FINNHUB_PER_MINUTE: "60" }), BUDGET_DEFAULTS.finnhub)
    assert.deepEqual(budgetFor("alpaca", { ALPACA_BURST: "200" }), BUDGET_DEFAULTS.alpaca)
    assert.deepEqual(budgetFor("massive", { MASSIVE_PER_MINUTE: "5", MASSIVE_BURST: "2" }), BUDGET_DEFAULTS.massive)
    assert.deepEqual(budgetFor("tiingo", { TIINGO_PER_MINUTE: "1" }), BUDGET_DEFAULTS.tiingo)
  })

  it("still lets an override lower a budget", () => {
    assert.deepEqual(budgetFor("alpaca", { ALPACA_PER_MINUTE: "100", ALPACA_BURST: "10" }), { perMinute: 100, burst: 10 })
  })

  it("never returns a budget that reaches the allowance, whatever the environment says", () => {
    for (const provider of providers) {
      const env = { [`${provider.toUpperCase()}_PER_MINUTE`]: "100000", [`${provider.toUpperCase()}_BURST`]: "100000" }
      const { perMinute, burst } = budgetFor(provider, env)
      if (provider === "tiingo") assert.ok(burst + perMinute * 60 < 50 && burst + perMinute * 1440 < 1000)
      else assert.ok(burst + perMinute < PER_MINUTE[provider])
    }
  })

  it("checks every timescale: tiingo 0.8/min burst 1 passes the hour but allows ~1,153 a day", () => {
    assert.ok(1 + 0.8 * 60 < 50)
    assert.ok(1 + 0.8 * 1440 > 1000)
    assert.deepEqual(budgetFor("tiingo", { TIINGO_PER_MINUTE: "0.8", TIINGO_BURST: "1" }), BUDGET_DEFAULTS.tiingo)
    assert.deepEqual(budgetFor("tiingo", { TIINGO_PER_MINUTE: "0.6", TIINGO_BURST: "1" }), { perMinute: 0.6, burst: 1 })
  })

  it("checks every timescale: finnhub 1/min burst 50 passes the minute but allows a 50-request instant burst", () => {
    assert.ok(50 + 1 < 60)
    assert.deepEqual(budgetFor("finnhub", { FINNHUB_PER_MINUTE: "1", FINNHUB_BURST: "50" }), BUDGET_DEFAULTS.finnhub)
    assert.deepEqual(budgetFor("finnhub", { FINNHUB_PER_MINUTE: "1", FINNHUB_BURST: "26" }), BUDGET_DEFAULTS.finnhub)
    assert.deepEqual(budgetFor("finnhub", { FINNHUB_PER_MINUTE: "1", FINNHUB_BURST: "20" }), { perMinute: 1, burst: 20 })
  })
})

describe("source guards: provider requests go through providerFetch", () => {
  const root = join(import.meta.dirname, "..")
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : []
    })
  const source = files(root)

  it("calls the global fetch only inside providerFetch", () => {
    const direct = source.filter((f) => /globalThis\.fetch\(/.test(readFileSync(f, "utf8"))).map((f) => f.slice(root.length + 1))
    assert.deepEqual(direct, ["lib/provider-fetch.ts"])
  })

  it("names a provider host only in the files that fetch through providerFetch", () => {
    const hosts = /(finnhub\.io|data\.alpaca\.markets|api\.alpaca\.markets|api\.massive\.com|api\.polygon\.io|api\.tiingo\.com)/
    const allowed = new Set(["lib/news-market.ts", "lib/alpaca.ts", "lib/tiingo.ts", "lib/finnhub.ts", "lib/market-data.ts", "app/api/cron/probe/route.ts", "app/api/news/market/route.ts", "lib/provider-stats-core.ts"])
    const named = source.filter((f) => hosts.test(readFileSync(f, "utf8"))).map((f) => f.slice(root.length + 1))
    for (const file of named) assert.ok(allowed.has(file), `${file} names a provider host: route it through providerFetch and add it here`)
  })
})
