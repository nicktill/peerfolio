import assert from "node:assert/strict"
import { test } from "node:test"
import { consensusThreeWay, devigThreeWay, gradeThreeWay, priceThreeWay, type Triple } from "./threeway.ts"
import { exchangeThreeWay, type ThreeWayBooks, type YesBook } from "./threeway-exchange.ts"
import { americanToProb } from "./odds.ts"

const now = new Date("2026-10-17T12:00:00Z")
const q = (book: string, price: number, at?: Date) => ({ book, price, point: null, at })
const book = (p: number, o: Partial<YesBook> = {}): YesBook => ({ bid: p - 0.005, ask: p + 0.005, topSize: 500, ageMs: 5_000, bookTsAgeMs: null, ...o })
const books = (h: number, d: number, a: number): ThreeWayBooks => ({ home: book(h), draw: book(d), away: book(a) })

test("devig sums to 1", () => {
  const f = devigThreeWay(-110, 250, 300)
  assert.ok(Math.abs(f[0] + f[1] + f[2] - 1) < 1e-12)
})

test("consensus requires all three quotes and enough books", () => {
  const mk = (n: number, drop?: string) => ({
    home: Array.from({ length: n }, (_, i) => q(`b${i}`, 120, now)),
    draw: Array.from({ length: n }, (_, i) => q(`b${i}`, 250, now)).filter((x) => x.book !== drop),
    away: Array.from({ length: n }, (_, i) => q(`b${i}`, 230, now)),
  })
  const c = consensusThreeWay(mk(3), { minBooks: 3, outlierDistance: 0.06, maxQuoteAgeMs: 60_000, now })
  assert.ok(c && Math.abs(c.fair[0] + c.fair[1] + c.fair[2] - 1) < 1e-12 && c.booksUsed === 3)
  assert.equal(consensusThreeWay(mk(3, "b1"), { minBooks: 3, outlierDistance: 0.06, maxQuoteAgeMs: 60_000, now }), null)
  assert.equal(consensusThreeWay(mk(2), { minBooks: 3, outlierDistance: 0.06, maxQuoteAgeMs: 60_000, now }), null)
})

test("consensus drops stale quotes and outliers", () => {
  const old = new Date(now.getTime() - 3_600_000)
  const base = { minBooks: 3, outlierDistance: 0.06, maxQuoteAgeMs: 900_000, now }
  const stale = { home: [q("a", 120, now), q("b", 120, now), q("c", 120, old)], draw: [q("a", 250, now), q("b", 250, now), q("c", 250, now)], away: [q("a", 230, now), q("b", 230, now), q("c", 230, now)] }
  assert.equal(consensusThreeWay(stale, base), null)
  const outlier = { home: [q("a", 120), q("b", 120), q("c", 120), q("d", -300)], draw: [q("a", 250), q("b", 250), q("c", 250), q("d", 600)], away: [q("a", 230), q("b", 230), q("c", 230), q("d", 900)] }
  assert.equal(consensusThreeWay(outlier, base)?.booksUsed, 3)
})

test("priceThreeWay properties over a grid", () => {
  let n = 0
  for (let h = 0.08; h < 0.85; h += 0.01) for (let d = 0.08; d < 0.5; d += 0.01) {
    const a = 1 - h - d
    if (a < 0.08) continue
    const fair: Triple = [h, d, a]
    const p = priceThreeWay(fair)
    assert.ok(p, `priced ${fair}`)
    n++
    const implied = p.map(americanToProb)
    // each side worse than fair, total at least 1 + margin
    implied.forEach((v, i) => assert.ok(v > fair[i]!))
    assert.ok(implied[0]! + implied[1]! + implied[2]! >= 1.02 - 1e-9)
    p.forEach((x) => { assert.ok(Number.isInteger(x) && x % 5 === 0 && (x <= -100 || x >= 100)); assert.ok(Math.abs(x) < 5000) })
    assert.deepEqual(priceThreeWay(fair), p)
  }
  assert.ok(n > 500)
})

test("priceThreeWay refuses lopsided, bad sums and non-finite", () => {
  assert.equal(priceThreeWay([0.9, 0.06, 0.04]), null)
  assert.equal(priceThreeWay([0.4, 0.3, 0.3001]), null)
  assert.equal(priceThreeWay([NaN, 0.5, 0.5]), null)
})

test("exchange: normalises three mids", () => {
  const r = exchangeThreeWay({ source: "polymarket", books: books(0.45, 0.28, 0.29), gameLive: false, acceptingOrders: true })
  assert.ok(r.ok)
  if (r.ok) assert.ok(Math.abs(r.view.fair[0] + r.view.fair[1] + r.view.fair[2] - 1) < 1e-12)
})

test("exchange: gates hold or freeze", () => {
  const x = (b: ThreeWayBooks, o: object = {}) => exchangeThreeWay({ source: "polymarket", books: b, gameLive: false, acceptingOrders: true, ...o })
  const base = books(0.45, 0.28, 0.27)
  const reason = (r: ReturnType<typeof x>) => (r.ok ? "ok" : `${r.action}:${r.reason}`)
  assert.match(reason(x({ ...base, draw: book(0.28, { bid: 0.2, ask: 0.35 }) })), /hold:.*too wide/)
  assert.match(reason(x({ ...base, away: book(0.27, { topSize: 50 }) })), /hold:.*too thin/)
  assert.match(reason(x({ ...base, home: book(0.45, { ageMs: 120_000 }) })), /hold:.*too old/)
  assert.match(reason(x({ ...base, home: book(0.45, { bookTsAgeMs: 20 * 60_000 }) })), /hold:.*stuck/)
  assert.match(reason(x({ ...base, draw: book(0.28, { bid: null }) })), /hold:.*invalid/)
  assert.match(reason(x(books(0.45, 0.4, 0.4))), /hold:.*sum/)
  assert.match(reason(x(base, { acceptingOrders: false })), /hold:not accepting/)
  assert.match(reason(x(base, { gameLive: true })), /freeze:/)
  assert.match(reason(x(books(0.85, 0.1, 0.05))), /freeze:.*range/)
  assert.match(reason(x(base, { other: books(0.55, 0.22, 0.23) })), /hold:sources disagree/)
  assert.ok(x(base, { other: books(0.46, 0.27, 0.27) }).ok)
})

test("grading", () => {
  assert.equal(gradeThreeWay("home", 2, 1), "win")
  assert.equal(gradeThreeWay("away", 2, 1), "loss")
  assert.equal(gradeThreeWay("draw", 2, 1), "loss")
  assert.equal(gradeThreeWay("draw", 1, 1), "win")
  assert.equal(gradeThreeWay("home", 1, 1), "loss")
  assert.equal(gradeThreeWay("away", 0, 3), "win")
  assert.equal(gradeThreeWay("home", null, 1), "void")
  assert.equal(gradeThreeWay("home", -1, 1), "void")
  assert.equal(gradeThreeWay("home", NaN, 1), "void")
  assert.equal(gradeThreeWay("over", 1, 1), "void")
})
