import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
/**
 * Database regression test for the after-close catch-up and the shared provider
 * budgets: the real positions and live-quote services against a disposable Postgres,
 * with the price providers stubbed and every request to them counted.
 *
 * IMPORT_TEST_DATABASE_URL=postgres://postgres:regression@127.0.0.1:55439/regression node apps/web/scripts/close-regression.mjs
 *
 * Never point this at an existing development database: use a disposable instance.
 */
async function main() {
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const postgres = require('postgres');
const assert = require('node:assert/strict');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const temp = await mkdtemp(path.join(tmpdir(), 'peerfolio-close-test-'));
const url = process.env.IMPORT_TEST_DATABASE_URL;
if (!url) throw new Error('Set IMPORT_TEST_DATABASE_URL to a disposable local Postgres database named regression');
const target = new URL(url);
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/regression') throw new Error('Tests require local /regression database');
const db = postgres(url, { onnotice: () => {} });
await db.unsafe(`CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), source text DEFAULT 'manual', name text, current_balance numeric(20,4), updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS securities(id text PRIMARY KEY, ticker_symbol text, name text, type text, close_price numeric(20,6), close_price_as_of date, close_price_final boolean NOT NULL DEFAULT true, previous_close numeric(20,6), iso_currency_code text DEFAULT 'USD', market_ticker text, metadata_checked_at timestamptz, updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS holdings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid REFERENCES accounts(id),user_id uuid REFERENCES users(id),security_id text REFERENCES securities(id),quantity numeric(24,8),cost_basis numeric(20,4),institution_value numeric(20,4),iso_currency_code text DEFAULT 'USD',updated_at timestamptz DEFAULT now(), UNIQUE(account_id,security_id));
CREATE TABLE IF NOT EXISTS fantasy_positions(security_id text);
CREATE TABLE IF NOT EXISTS provider_budgets(provider text PRIMARY KEY, tokens double precision NOT NULL, refilled_at timestamptz NOT NULL DEFAULT now(), blocked_until timestamptz, last_granted boolean NOT NULL DEFAULT true);`);
// One bundle for both services, so they share one module graph, as they do in the app.
await build({stdin:{contents:"export * from './positions.ts'; export { ensureLivePrice } from './live-quotes.ts'; export { withProviderPatience } from './provider-fetch.ts'; export { createFinnhubProvider } from './finnhub.ts';",resolveDir:root+'/apps/web/src/lib',sourcefile:'entry.ts',loader:'ts'},outfile:path.join(temp,'services.cjs'),bundle:true,platform:'node',format:'cjs',nodePaths:[path.join(root,'node_modules')],tsconfig:root+'/apps/web/tsconfig.json',logLevel:'silent',plugins:[{name:'test-isolation',setup(b){
b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'stub'}));
b.onResolve({filter:/^@web\/lib\/api$/},()=>({path:'api',namespace:'stub'}));
b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='api'?'export class ApiError extends Error { constructor(message,status=400){super(message);this.status=status;} }':'',loader:'js'}));
}}]});
process.env.DATABASE_URL = url;
for (const key of Object.keys(process.env)) if (/API_KEY|API_SECRET|_PER_MINUTE|_BURST|QUOTE_PROVIDER/.test(key)) delete process.env[key];
process.env.FINNHUB_API_KEY = 'test';
process.env.MASSIVE_API_KEY = 'test';
const { refreshStalePrices, importPositions, ensureLivePrice, withProviderPatience, createFinnhubProvider } = require(path.join(temp, 'services.cjs'));

// Monday Oct 5, 2026. The catch-up runs at 7pm New York time, after the session; trades at 2pm, during it.
const evening = Date.parse('2026-10-05T23:00:00Z');
const afternoon = new Date('2026-10-05T18:00:00Z');
const day = '2026-10-05';
const at4pm = Date.parse('2026-10-05T20:00:00Z');
const quote = (price, t) => ({ c: price, t: Math.floor(t / 1000) });

let provider;
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
globalThis.fetch = async (input, init) => provider(String(input), init);

/** Seeds a clean database, sets the provider budgets, and records every request that reaches a provider. */
async function scenario(name, { rows, respond, budgets = {} }) {
  await db.unsafe('TRUNCATE holdings, fantasy_positions, accounts, securities, users, provider_budgets CASCADE');
  for (const key of Object.keys(process.env)) if (/_PER_MINUTE|_BURST/.test(key)) delete process.env[key];
  // Generous unless a scenario is about the budget: the other scenarios test the catch-up itself.
  Object.assign(process.env, { FINNHUB_PER_MINUTE: '600', FINNHUB_BURST: '100', MASSIVE_PER_MINUTE: '600', MASSIVE_BURST: '100' }, budgets);
  const [{ id: user }] = await db`INSERT INTO users DEFAULT VALUES RETURNING id`;
  const [{ id: account }] = await db`INSERT INTO accounts(user_id,name) VALUES(${user},'A') RETURNING id`;
  for (const r of rows) {
    await db`INSERT INTO securities(id,ticker_symbol,type,close_price,close_price_as_of,close_price_final,previous_close,market_ticker,updated_at)
      VALUES(${'mkt:' + r.ticker},${r.ticker},'equity',${r.price},${r.asOf ?? day},${r.final},${r.previousClose ?? null},${r.ticker},${r.checkedAt ?? '2026-10-05T19:04:08Z'})`;
    await db`INSERT INTO holdings(account_id,user_id,security_id,quantity) VALUES(${account},${user},${'mkt:' + r.ticker},10)`;
  }
  const sent = { finnhub: [], massive: [], prev: 0, grouped: 0 };
  provider = async (u, init) => {
    if (u.includes('finnhub.io')) {
      sent.finnhub.push({ at: Date.now(), symbol: new URL(u).searchParams.get('symbol') });
      await new Promise((r) => setTimeout(r, 20));
      if (init?.signal?.aborted) throw new DOMException('The operation timed out.', 'TimeoutError');
    } else {
      sent.massive.push({ at: Date.now() });
      if (u.includes('/prev')) sent.prev++;
      if (u.includes('/grouped/')) sent.grouped++;
    }
    return respond(u, json);
  };
  const stored = async () => Object.fromEntries((await db`SELECT market_ticker, close_price, close_price_final, previous_close, updated_at FROM securities`).map((r) => [r.market_ticker, r]));
  const values = async () => Object.fromEntries((await db`SELECT security_id, institution_value FROM holdings`).map((r) => [r.security_id, r.institution_value]));
  console.log(`ran: ${name}`);
  return { user, account, sent, stored, values };
}
const catchUp = () => refreshStalePrices({ minIntervalMinutes: 0, now: evening });
const finnhubSymbol = (u) => new URL(u).searchParams.get('symbol');
const noBars = (u, json) => (u.includes('/grouped/') ? json({}, 404) : json({ results: [] }));

// 1. A live price from the session is replaced by the official close; an after-hours print is not a close;
//    a price already final is left alone.
{
  const { sent, stored, values } = await scenario('live price replaced by the official close', {
    rows: [
      { ticker: 'TSLA', price: 381.39, final: false, previousClose: 370.59 },
      { ticker: 'AHRS', price: 49, final: false },
      { ticker: 'DONE', price: 12, final: true },
    ],
    respond: (u, json) => {
      if (!u.includes('finnhub.io')) return noBars(u, json);
      if (finnhubSymbol(u) === 'TSLA') return json(quote(378.73, at4pm));
      if (finnhubSymbol(u) === 'AHRS') return json(quote(50.5, at4pm + 75 * 60_000));
      return json({ c: 0, t: 0 });
    },
  });
  const result = await catchUp();
  const rows = await stored();
  assert.equal(rows.TSLA.close_price, '378.730000');
  assert.equal(rows.TSLA.close_price_final, true);
  assert.equal(rows.TSLA.previous_close, '370.590000', 'the previous close is kept');
  assert.equal((await values())['mkt:TSLA'], '3787.3000', 'holdings are revalued');
  assert.equal(rows.AHRS.close_price, '49.000000');
  assert.equal(rows.AHRS.close_price_final, false);
  assert.equal(rows.DONE.close_price, '12.000000');
  assert.ok(!sent.finnhub.some((r) => r.symbol === 'DONE'), 'a final close is not asked for again');
  assert.equal(result.unconfirmed, 1);
}

// 2. Two servers at once: each ticker is asked of Finnhub once, and a ticker Finnhub couldn't
//    confirm falls back to /prev.
{
  const { sent, stored } = await scenario('concurrent runs, /prev fallback', {
    rows: ['AAA', 'BBB', 'CCC', 'NOFH'].map((ticker) => ({ ticker, price: 50, final: false })),
    respond: (u, json) => {
      if (u.includes('finnhub.io')) return finnhubSymbol(u) === 'NOFH' ? json({ c: 0, t: 0 }) : json(quote(100.5, at4pm));
      if (u.includes('/prev')) return json({ results: [{ c: 77.7, t: at4pm }] });
      return noBars(u, json);
    },
  });
  const results = await Promise.all([catchUp(), catchUp()]);
  const rows = await stored();
  for (const t of ['AAA', 'BBB', 'CCC', 'NOFH']) assert.equal(sent.finnhub.filter((r) => r.symbol === t).length, 1, `${t} asked once across both servers`);
  assert.equal(sent.prev, 1, 'only the ticker Finnhub could not confirm goes to /prev');
  for (const t of ['AAA', 'BBB', 'CCC']) assert.equal(rows[t].close_price, '100.500000');
  assert.equal(rows.NOFH.close_price, '77.700000');
  for (const t of ['AAA', 'BBB', 'CCC', 'NOFH']) assert.equal(rows[t].close_price_final, true);
  assert.ok(results.every((r) => !r.failed));
}

// 3. A 429 from Massive's whole-market lookup doesn't stop the catch-up (Finnhub still confirms),
//    and nothing asks Massive again during its Retry-After: not even the /prev fallback.
{
  const { sent, stored } = await scenario('whole-market 429: cooldown honored, catch-up continues', {
    rows: ['AAA', 'NOFH'].map((ticker) => ({ ticker, price: 50, final: false })),
    respond: (u, json) => {
      if (u.includes('finnhub.io')) return finnhubSymbol(u) === 'NOFH' ? json({ c: 0, t: 0 }) : json(quote(100.5, at4pm));
      if (u.includes('/grouped/')) return json({ status: 'ERROR' }, 429, { 'retry-after': '45' });
      return json({ results: [{ c: 77.7, t: at4pm }] });
    },
  });
  const result = await catchUp();
  const rows = await stored();
  assert.ok(!result.failed, 'a whole-market 429 does not abort the catch-up');
  assert.equal(rows.AAA.close_price_final, true, 'Finnhub, a different provider, still confirms');
  assert.equal(sent.grouped, 1);
  assert.equal(sent.prev, 0, 'no request to Massive during its cooldown, by any path');
  assert.equal(rows.NOFH.close_price_final, false);
  const [{ seconds }] = await db`SELECT EXTRACT(EPOCH FROM blocked_until - now())::float8 AS seconds FROM provider_budgets WHERE provider = 'massive'`;
  assert.ok(seconds > 40 && seconds <= 45, `Retry-After honored (${seconds}s left)`);
}

// 4. Several servers asking for different ticker batches while trades and an import also price
//    tickers: the requests that reach Finnhub stay within the budget over any window, the work
//    beyond it waits, and it gets done once the budget refills.
{
  const perMinute = 12, burst = 4;
  const tickers = Array.from({ length: 60 }, (_, i) => `T${String(i).padStart(2, '0')}`);
  const trades = ['TRD1', 'TRD2', 'TRD3'];
  const { user, account, sent, stored } = await scenario('budget holds across servers, trades and imports', {
    budgets: { FINNHUB_PER_MINUTE: String(perMinute), FINNHUB_BURST: String(burst) },
    rows: [...tickers, ...trades].map((ticker) => ({ ticker, price: 50, final: false })),
    respond: (u, json) => {
      if (!u.includes('finnhub.io')) return noBars(u, json);
      const symbol = finnhubSymbol(u);
      // Trades are priced during the session (2pm); everything else asks for the 4pm close.
      return json(quote(101, trades.includes(symbol) ? afternoon.getTime() - 60_000 : symbol.startsWith('IMP') ? at4pm : at4pm));
    },
  });
  const started = Date.now();
  await Promise.all([
    catchUp(),
    catchUp(),
    catchUp(),
    ...trades.map((t) => ensureLivePrice(t, { now: afternoon })),
    importPositions(account, user, ['IMP1', 'IMP2', 'IMP3'].map((symbol) => ({ symbol, kind: 'stock', quantity: 1 })), { replace: false }),
  ]);
  const elapsedMinutes = (Date.now() - started) / 60_000;
  const allowed = Math.floor(burst + perMinute * elapsedMinutes + 1e-9);
  console.log(`  finnhub requests: ${sent.finnhub.length}, allowed: ${allowed} (demand: ${tickers.length + trades.length + 3})`);
  assert.ok(sent.finnhub.length <= allowed, `${sent.finnhub.length} requests reached Finnhub; the budget allows ${allowed}`);
  assert.ok(sent.finnhub.length >= 1, 'work went through while the budget allowed');
  const confirmedAfter = async () => Object.values(await stored()).filter((r) => tickers.includes(r.market_ticker) && r.close_price_final).length;
  const firstRound = await confirmedAfter();
  assert.ok(firstRound < tickers.length, 'work beyond the budget was deferred');

  // The bucket refills (here by hand, as the test can't wait a minute): the deferred tickers are
  // still first in line and the next run confirms more of them.
  await db`UPDATE provider_budgets SET tokens = ${burst}, refilled_at = now() WHERE provider = 'finnhub'`;
  await catchUp();
  const secondRound = await confirmedAfter();
  assert.ok(secondRound > firstRound, `deferred work resumes (${firstRound} -> ${secondRound} confirmed)`);
  assert.ok(secondRound - firstRound <= burst, 'and still within the budget');
}

// 5. A 429 from Finnhub with Retry-After: every caller stops asking it, by every path, until it passes.
{
  const { user, account, sent, stored } = await scenario('Finnhub 429: shared cooldown', {
    rows: ['AAA', 'BBB', 'TRD1'].map((ticker) => ({ ticker, price: 50, final: false })),
    respond: (u, json) => (u.includes('finnhub.io') ? json({ error: 'API limit reached' }, 429, { 'retry-after': '30' }) : noBars(u, json)),
  });
  await catchUp();
  const afterFirst = sent.finnhub.length;
  // Up to the adapter's 4 in flight, each with a token, may already be out when the first 429 lands.
  assert.ok(afterFirst >= 1 && afterFirst <= 4, `the batch stops at the 429 (${afterFirst} sent)`);
  const [{ seconds }] = await db`SELECT EXTRACT(EPOCH FROM blocked_until - now())::float8 AS seconds FROM provider_budgets WHERE provider = 'finnhub'`;
  assert.ok(seconds > 25 && seconds <= 30, `Retry-After honored (${seconds}s left)`);
  const released = (await stored()).AAA.updated_at.getTime();
  assert.ok(released < evening - 15 * 60_000, 'the unanswered tickers go back to the front of the line');
  await Promise.all([catchUp(), ensureLivePrice('TRD1', { now: afternoon }), importPositions(account, user, [{ symbol: 'IMP9', kind: 'stock', quantity: 1 }], { replace: false })]);
  assert.equal(sent.finnhub.length, afterFirst, 'no request reaches Finnhub during its cooldown, by any path');
}

// 6. When the budget can't be checked (here, its table is gone), nothing goes out unmetered:
//    the requests are refused and the stored prices stand.
{
  const { sent, stored } = await scenario('budget unavailable: requests refused, prices kept', {
    rows: ['AAA', 'TRD1'].map((ticker) => ({ ticker, price: 50, final: false })),
    respond: (u, json) => (u.includes('finnhub.io') ? json(quote(100.5, at4pm)) : noBars(u, json)),
  });
  await db.unsafe('ALTER TABLE provider_budgets RENAME TO provider_budgets_gone');
  try {
    await Promise.all([catchUp(), ensureLivePrice('TRD1', { now: afternoon })]);
  } finally {
    await db.unsafe('ALTER TABLE provider_budgets_gone RENAME TO provider_budgets');
  }
  assert.equal(sent.finnhub.length + sent.massive.length, 0, 'no request goes out without a budget check');
  const rows = await stored();
  assert.equal(rows.AAA.close_price, '50.000000');
  assert.equal(rows.TRD1.close_price, '50.000000');
}

// 7. A request's timeout starts when it is sent, not while it waits for budget: a scheduled job
//    that waits a second for a token still gets its full 300ms for the request itself.
{
  const { sent } = await scenario('timeout starts after the wait for budget', {
    budgets: { FINNHUB_PER_MINUTE: '60', FINNHUB_BURST: '1' },
    rows: [],
    respond: (u, json) => json(quote(100.5, at4pm)),
  });
  await db`INSERT INTO provider_budgets(provider, tokens, refilled_at) VALUES('finnhub', 0, now())`;
  const started = Date.now();
  const result = await withProviderPatience(10_000, () => createFinnhubProvider({ apiKey: 'test', timeoutMs: 300 }).getQuotes(['AAA']));
  assert.ok(Date.now() - started >= 900, 'it waited for the token');
  assert.equal(sent.finnhub.length, 1);
  assert.equal(result.failed, 0, 'the request was not timed out by the wait');
  assert.equal(result.quotes.get('AAA')?.price, 100.5);
}

// 8. Freshness is counted across every held stock, even when a run has nothing to do: live prices
//    never confirmed (this session's and older ones) and official closes from an older session.
{
  await scenario('freshness counted with no eligible work', {
    rows: [
      { ticker: 'LIVE', price: 50, final: false, checkedAt: '2026-10-05T22:59:00Z' },
      { ticker: 'OLDLIVE', price: 50, final: false, asOf: '2026-10-02', checkedAt: '2026-10-05T22:59:00Z' },
      { ticker: 'OLDCLOSE', price: 50, final: true, asOf: '2026-10-01', checkedAt: '2026-10-05T22:59:00Z' },
      { ticker: 'FRESH', price: 50, final: true, checkedAt: '2026-10-05T22:59:00Z' },
    ],
    respond: (u, json) => json({}, 500),
  });
  const result = await catchUp();
  assert.equal(result.refreshed, 0);
  assert.equal(result.unconfirmed, 2, 'both live prices count, this session and an older one');
  assert.equal(result.behind, 1);
}

await db.end();
console.log('PASS: after-close catch-up and shared provider budgets');
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
