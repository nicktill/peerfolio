import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { externalFlow, flowChanges, investmentHistoryStart, investmentPages, mergeDuplicateHoldings, retryPlaid, splitUsableHoldings, type InvestmentFlow } from "./plaid-sync-core.ts"
import { timeWeightedReturn } from "./ranges.ts"

const tx = (id: string, subtype: string, amount: number, account = "a"): InvestmentFlow => ({ investment_transaction_id: id, account_id: account, type: "cash", subtype, amount })
const point = (date: string, value: number, netFlows = 0) => ({ date, investableAssets: value, netWorth: value, netFlows, isVerified: true })
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)

describe("Plaid financial regression scenarios", () => {
  it("bounds investment history to Plaid's 24-month availability", () => {
    const now = new Date("2026-10-06T12:00:00Z")
    assert.equal(investmentHistoryStart(new Date("2022-01-01T00:00:00Z"), now), "2024-10-06")
    assert.equal(investmentHistoryStart(new Date("2026-10-01T00:00:00Z"), now), "2026-10-01")
  })
  it("excludes deposits and withdrawals while keeping market gains", () => {
    const flow = flowChanges([tx("deposit", "deposit", -500), tx("withdraw", "withdrawal", 200)], new Map(), new Set())
    near(timeWeightedReturn([point("2026-10-01", 1000), point("2026-10-02", 1400, flow.net)]).percent, 10)
  })
  it("nets transfers between tracked accounts to zero", () => {
    assert.equal(flowChanges([tx("out", "transfer", 400), tx("in", "transfer", -400, "b")], new Map(), new Set()).net, 0)
  })
  it("keeps dividends as returns and sales/splits/exercises as internal activity", () => {
    for (const subtype of ["dividend", "dividend reinvestment", "sell", "split", "exercise", "transfer fee"]) {
      assert.equal(externalFlow({ ...tx(subtype, subtype, -20), type: "transfer" }), 0)
    }
    near(timeWeightedReturn([point("2026-10-01", 1000), point("2026-10-02", 1020)]).percent, 2)
    near(timeWeightedReturn([point("2026-10-01", 1000), point("2026-10-02", 1000)]).percent, 0)
  })
  it("does not count flows already included in a newly linked account's baseline", () => {
    const result = flowChanges([tx("deposit", "deposit", -500)], new Map(), new Set(["a"]))
    assert.equal(result.net, 0)
    assert.equal(result.entries[0]!.baseline, true)
  })
  it("ignores delayed historical transactions already included in the account baseline", () => {
    const historical = { ...tx("old", "deposit", -500), date: "2026-10-01" }
    const current = { ...tx("new", "deposit", -200), date: "2026-10-03" }
    const result = flowChanges([historical, current], new Map(), new Set(), new Map([["a", "2026-10-02"]]))
    assert.equal(result.net, 200)
    assert.equal(result.entries[0]!.baseline, true)
    assert.equal(result.entries[1]!.baseline, false)
  })
  it("treats a combined retirement contribution/purchase as incoming capital", () => {
    const combined = { ...tx("401k", "contribution", 500), type: "buy" }
    assert.equal(externalFlow(combined), 500)
    near(timeWeightedReturn([point("2026-10-01", 1000), point("2026-10-02", 1500, externalFlow(combined))]).percent, 0)
  })
  it("deduplicates repeated events and applies only a corrected amount's difference", () => {
    const previous = new Map([["deposit", { amount: 500, baseline: false }]])
    assert.equal(flowChanges([tx("deposit", "deposit", -500), tx("deposit", "deposit", -500)], previous, new Set()).net, 0)
    assert.equal(flowChanges([tx("deposit", "deposit", -600)], previous, new Set()).net, 100)
    assert.equal(flowChanges([{ ...tx("deposit", "deposit", -500), type: "cancel" }], previous, new Set()).net, -500)
  })
  it("reverses disappeared canceled cash flows only inside a complete fetched window", () => {
    const previous = new Map([
      ["removed", { amount: 500, baseline: false, date: "2026-10-03" }],
      ["aged-out", { amount: 100, baseline: false, date: "2022-01-01" }],
      ["historical", { amount: 0, baseline: true, date: "2026-10-02" }],
    ])
    const result = flowChanges([], previous, new Set(), new Map(), { start: "2024-10-06", end: "2026-10-06" })
    assert.equal(result.net, -500)
    assert.equal(result.entries.find((r) => r.transactionId === "removed")!.amount, 0)
    assert.equal(result.entries.find((r) => r.transactionId === "historical")!.baseline, true)
    assert.equal(result.entries.some((r) => r.transactionId === "aged-out"), false)
    assert.equal(flowChanges([], previous, new Set()).net, 0)
  })
  it("rejects conflicting duplicate transaction rows instead of arbitrarily choosing one", () => {
    assert.throws(() => flowChanges([tx("deposit", "deposit", -500), tx("deposit", "deposit", -600)], new Map(), new Set()), /Conflicting/)
  })
  it("ignores reconnect baseline transactions even if amounts are corrected", () => {
    const previous = new Map([["deposit", { amount: 0, baseline: true }]])
    assert.equal(flowChanges([tx("deposit", "deposit", -600)], previous, new Set()).net, 0)
  })
  it("reads transactions beyond the first page and rejects incomplete pages", async () => {
    const offsets: number[] = []
    const rows = await investmentPages(async (offset) => {
      offsets.push(offset)
      return { investment_transactions: offset === 0 ? [1, 2] : [3], total_investment_transactions: 3 }
    })
    assert.deepEqual(rows, [1, 2, 3])
    assert.deepEqual(offsets, [0, 2])
    await assert.rejects(investmentPages(async () => ({ investment_transactions: [tx("duplicate", "deposit", -500)], total_investment_transactions: 2 })), /Duplicate investment transaction/)
    await assert.rejects(investmentPages(async () => ({ investment_transactions: [], total_investment_transactions: 1 })), /Incomplete/)
  })
  it("rejects changing or malformed pagination totals rather than import partial data", async () => {
    await assert.rejects(investmentPages(async (offset) => ({ investment_transactions: [offset], total_investment_transactions: offset === 0 ? 2 : 3 })), /changed during pagination/)
    for (const total of [NaN, -1, 1.5]) {
      await assert.rejects(investmentPages(async () => ({ investment_transactions: [], total_investment_transactions: total })), /Invalid/)
    }
    await assert.rejects(investmentPages(async () => ({ investment_transactions: [1, 2], total_investment_transactions: 1 })), /exceed/)
  })
  it("retries not-ready data, caps retry attempts, and never retries login errors", async () => {
    let attempts = 0
    const waits: number[] = []
    const pending = { response: { data: { error_code: "PRODUCT_NOT_READY" } } }
    assert.equal(await retryPlaid(async () => { if (++attempts < 3) throw pending; return "ready" }, async (ms) => { waits.push(ms) }), "ready")
    assert.deepEqual(waits, [2000, 3000])
    attempts = 0
    // A new Item's data can take a while to appear, so "not ready" is waited on for longer than other errors.
    await assert.rejects(retryPlaid(async () => { attempts++; throw pending }, async () => {}))
    assert.equal(attempts, 6)
    attempts = 0
    await assert.rejects(retryPlaid(async () => { attempts++; throw { response: { status: 503 } } }, async () => {}))
    assert.equal(attempts, 3)
    attempts = 0
    await assert.rejects(retryPlaid(async () => { attempts++; throw { response: { data: { error_code: "ITEM_LOGIN_REQUIRED" } } } }, async () => {}))
    assert.equal(attempts, 1)
  })
  it("retries transient connection failures with the same bounded budget", async () => {
    let attempts = 0
    assert.equal(await retryPlaid(async () => { if (++attempts === 1) throw { code: "ECONNRESET" }; return "ready" }, async () => {}), "ready")
    assert.equal(attempts, 2)
  })
  it("stops expired syncs and refuses retries whose backoff exceeds the deadline", async () => {
    let attempts = 0
    await assert.rejects(retryPlaid(async () => { attempts++; return "ready" }, async () => {}, Date.now() - 1), /deadline/)
    assert.equal(attempts, 0)
    await assert.rejects(retryPlaid(async () => { attempts++; throw { code: "ECONNRESET" } }, async () => {}, Date.now() + 500), /deadline/)
    assert.equal(attempts, 1)
  })
})

describe("Holdings from real brokerages", () => {
  const line = (over: Record<string, unknown> = {}) => ({ account_id: "a", security_id: "s", quantity: 2, institution_value: 100, cost_basis: 80, iso_currency_code: "USD", unofficial_currency_code: null, ...over })
  it("keeps ordinary lines and leaves out ones we can't show, instead of failing", () => {
    const crypto = line({ security_id: "btc", iso_currency_code: null, unofficial_currency_code: "BTC" })
    const euro = line({ security_id: "eu", iso_currency_code: "EUR" })
    const margin = line({ security_id: "cash", institution_value: -400 })
    const short = line({ security_id: "short", quantity: -3 })
    const unpriced = line({ security_id: "x", institution_value: null })
    const { kept, skipped } = splitUsableHoldings([line(), crypto, euro, margin, short, unpriced])
    assert.deepEqual(kept.map((k) => k.security_id), ["s"])
    assert.equal(skipped.length, 5)
  })
  it("combines the same security in one account, and keeps different accounts apart", () => {
    const merged = mergeDuplicateHoldings([line(), line({ quantity: 1, institution_value: 50, cost_basis: null }), line({ account_id: "b" })])
    assert.equal(merged.length, 2)
    const a = merged.find((m) => m.account_id === "a")!
    assert.equal(a.quantity, 3)
    assert.equal(a.institution_value, 150)
    assert.equal(a.cost_basis, 80)
  })
})
