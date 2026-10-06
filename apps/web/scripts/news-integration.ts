import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import postgres from "postgres"
import { sql } from "drizzle-orm"
import { db, newsBriefs, newsJobLeases } from "@web/db"
import { runNews, readNews } from "@web/lib/news"
import { readNewsMarket, updateNewsMarket } from "@web/lib/news-market-store"
import { GET as readMarketRoute } from "@web/app/api/news/market/route"
import { GET as readNewsRoute } from "@web/app/api/news/route"
import { claimNewsLease, releaseNewsLease } from "@web/lib/news-lease"
async function main() {
const url = process.env.DATABASE_URL!
assert.equal(new URL(url).hostname,"127.0.0.1")
assert.equal(new URL(url).port, process.env.NEWS_TEST_PORT)
assert.equal(new URL(url).pathname,"/peerfolio_news_test")
const raw = postgres(url,{prepare:false})
for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
  await raw.begin(async tx => { for (const statement of readFileSync(`drizzle/${file}`,"utf8").split("--> statement-breakpoint")) if (statement.trim()) await tx.unsafe(statement) })
}
console.log("PASS all main migrations plus the independent News migration")
// Exercise actual scheduled stores/recaps with no AI and fully mocked HTTP.
const morningAt = new Date('2026-10-06T15:10:00Z')
let quoteAt = morningAt
let quoteCalls = 0
process.env.FINNHUB_API_KEY = 'local'
globalThis.fetch = async input => {
  const url = String(input)
  if (url.includes('/quote?')) { quoteCalls++; return Response.json({ c:100, pc:99, d:1, dp:1.01, t:quoteAt.getTime()/1000 }) }
  if (url.includes('/calendar/earnings')) return Response.json({ earningsCalendar: [] })
  if (url.includes('cnn.com')) return Response.json({})
  return new Response('<rss><channel>' + [1,2,3].map(i => `<item><title>Market headline ${i}</title><link>https://example.test/story${i}</link><pubDate>Tue, 06 Oct 2026 14:30:00 GMT</pubDate><description>Investors reviewed company results.</description></item>`).join('') + '</channel></rss>')
}
await runNews(morningAt, {slot:'morning'})
assert.equal(quoteCalls,4)
assert.equal((await readNews()).day?.phase,'morning')
assert.equal((await readNewsMarket()).board?.indexes.length,4)
quoteAt = new Date('2026-10-06T20:35:00Z')
await runNews(quoteAt,{slot:'close'})
assert.equal(quoteCalls,19)
assert.equal((await readNews()).day?.phase,'close')
assert.equal((await readNewsMarket()).board?.sectors.length,11)
const saved = await readNewsMarket()
globalThis.fetch = async () => { throw new Error('Provider down / external HTTP forbidden') }
await updateNewsMarket('morning',new Date('2026-10-07T15:10:00Z'))
assert.deepEqual(await readNewsMarket(),saved)
assert.equal((await readMarketRoute(new Request('http://localhost/api/news/market'), {params:Promise.resolve(undefined)})).status,200)
assert.equal((await readNews()).day?.phase,'close')
process.env.FINNHUB_API_KEY = ''
await db.execute(sql`delete from provider_budgets`) // Isolate later fantasy-fill fixtures from News quota usage.
console.log('PASS actual News morning/close publishing, 19 quotes/day, failure retention and provider-free public reads')


assert.equal((await readNewsRoute(new Request("http://localhost/api/news"),{params:Promise.resolve(undefined)})).status,200)
const created = (await readNews()).day!.createdAt
await runNews(new Date("2026-10-06T21:00:00Z"),{slot:"close"})
assert.equal((await readNews()).day!.createdAt,created)
const tokens = await Promise.all([1,2,3].map(() => claimNewsLease("same-slot",86400,330)))
assert.equal(tokens.filter(Boolean).length,1)
await releaseNewsLease("same-slot",tokens.find(Boolean)!)
assert.equal(await claimNewsLease("same-slot",86400,330),null)
await db.execute(sql`update news_job_leases set attempted_at = now() - interval '2 days', expires_at = now() - interval '1 second' where name = 'same-slot'`)
const replacement = await claimNewsLease("same-slot",86400,330)
assert.ok(replacement)
await releaseNewsLease("same-slot",tokens.find(Boolean)!)
assert.equal(await claimNewsLease("same-slot",0,330),null)
assert.equal((await db.select().from(newsJobLeases)).length,1)
console.log("PASS provider-free recap reads, duplicate publication and concurrent News-only leases")
// Existing midday records remain readable, without rewriting them.
await db.insert(newsBriefs).values({period:"midday",periodEnd:"2026-10-07",headline:"Legacy midday",body:"Existing saved text",takeaways:[],sources:[],fallback:true,createdAt:new Date("2026-10-07T15:30:00Z")})
assert.equal((await readNews()).day?.headline,"Legacy midday")
console.log("PASS legacy midday compatibility")
await raw.end()
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)})
