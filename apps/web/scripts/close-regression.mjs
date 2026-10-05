import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
/**
 * Database regression test for the after-close catch-up: the real positions service
 * against a disposable Postgres, with the price providers stubbed.
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
CREATE TABLE IF NOT EXISTS fantasy_positions(security_id text);`);
await build({entryPoints:[root+'/apps/web/src/lib/positions.ts'],outfile:path.join(temp,'positions.cjs'),bundle:true,platform:'node',format:'cjs',nodePaths:[path.join(root,'node_modules')],tsconfig:root+'/apps/web/tsconfig.json',logLevel:'silent',plugins:[{name:'test-isolation',setup(b){
b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'stub'}));
b.onResolve({filter:/^@web\/lib\/api$/},()=>({path:'api',namespace:'stub'}));
b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='api'?'export class ApiError extends Error {}':'',loader:'js'}));
}}]});
process.env.DATABASE_URL = url;
for (const key of Object.keys(process.env)) if (/API_KEY|API_SECRET/.test(key)) delete process.env[key];
process.env.FINNHUB_API_KEY = 'test';
process.env.MASSIVE_API_KEY = 'test';

const { refreshStalePrices } = require(path.join(temp, 'positions.cjs'));

// Monday Oct 5, 2026, 7pm New York time: the session is over and its close should exist.
const now = Date.parse('2026-10-05T23:00:00Z');
const day = '2026-10-05';
const at4pm = Date.parse('2026-10-05T20:00:00Z');
const quote = (price, t) => ({ c: price, t: Math.floor(t / 1000) });

let provider;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input) => provider(String(input));

async function scenario(name, { rows, respond, runs = 1 }) {
  await db.unsafe('TRUNCATE holdings, fantasy_positions, accounts, securities, users CASCADE');
  const [{ id: user }] = await db`INSERT INTO users DEFAULT VALUES RETURNING id`;
  const [{ id: account }] = await db`INSERT INTO accounts(user_id,name) VALUES(${user},'A') RETURNING id`;
  for (const r of rows) {
    await db`INSERT INTO securities(id,ticker_symbol,type,close_price,close_price_as_of,close_price_final,previous_close,market_ticker,updated_at)
      VALUES(${'mkt:' + r.ticker},${r.ticker},'equity',${r.price},${r.asOf ?? day},${r.final},${r.previousClose ?? null},${r.ticker},'2026-10-05T19:04:08Z')`;
    await db`INSERT INTO holdings(account_id,user_id,security_id,quantity) VALUES(${account},${user},${'mkt:' + r.ticker},10)`;
  }
  const calls = { finnhub: {}, prev: 0, grouped: 0 };
  provider = async (u) => {
    if (u.includes('finnhub.io')) {
      const symbol = new URL(u).searchParams.get('symbol');
      calls.finnhub[symbol] = (calls.finnhub[symbol] ?? 0) + 1;
      await new Promise((r) => setTimeout(r, 20));
    } else if (u.includes('/prev')) calls.prev++;
    else if (u.includes('/grouped/')) calls.grouped++;
    return respond(u, json);
  };
  const results = await Promise.all(Array.from({ length: runs }, () => refreshStalePrices({ minIntervalMinutes: 0, now })));
  const stored = Object.fromEntries((await db`SELECT market_ticker, close_price, close_price_final, previous_close FROM securities`).map((r) => [r.market_ticker, r]));
  const values = Object.fromEntries((await db`SELECT security_id, institution_value FROM holdings`).map((r) => [r.security_id, r.institution_value]));
  console.log(`ran: ${name}`);
  return { results, stored, values, calls };
}

// 1. A live price from the session is replaced by the official close; an after-hours print is not a close;
//    a price already final is left alone.
{
  const { results, stored, values, calls } = await scenario('live price replaced by the official close', {
    rows: [
      { ticker: 'TSLA', price: 381.39, final: false, previousClose: 370.59 },
      { ticker: 'AHRS', price: 49, final: false },
      { ticker: 'DONE', price: 12, final: true },
    ],
    respond: (u, json) => {
      if (u.includes('finnhub.io')) {
        const symbol = new URL(u).searchParams.get('symbol');
        if (symbol === 'TSLA') return json(quote(378.73, at4pm));
        if (symbol === 'AHRS') return json(quote(50.5, at4pm + 75 * 60_000));
        return json({ c: 0, t: 0 });
      }
      return json({ results: [] });
    },
  });
  assert.equal(stored.TSLA.close_price, '378.730000');
  assert.equal(stored.TSLA.close_price_final, true);
  assert.equal(stored.TSLA.previous_close, '370.590000', 'the previous close is kept');
  assert.equal(values['mkt:TSLA'], '3787.3000', 'holdings are revalued');
  assert.equal(stored.AHRS.close_price, '49.000000');
  assert.equal(stored.AHRS.close_price_final, false);
  assert.equal(stored.DONE.close_price, '12.000000');
  assert.equal(calls.finnhub.DONE, undefined, 'a final close is not asked for again');
  assert.equal(results[0].unconfirmed, 1);
}

// 2. Two servers at once, with the whole-market lookup rate limited: each ticker is asked of
//    Finnhub once, the 429 doesn't stop the catch-up, and only the ticker Finnhub couldn't
//    confirm falls back to /prev.
{
  const { results, stored, calls } = await scenario('concurrent runs, whole-market 429, /prev fallback', {
    runs: 2,
    rows: ['AAA', 'BBB', 'CCC', 'NOFH'].map((ticker) => ({ ticker, price: 50, final: false })),
    respond: (u, json) => {
      if (u.includes('finnhub.io')) return new URL(u).searchParams.get('symbol') === 'NOFH' ? json({ c: 0, t: 0 }) : json(quote(100.5, at4pm));
      if (u.includes('/grouped/')) return json({ status: 'ERROR' }, 429);
      if (u.includes('/prev')) return json({ results: [{ c: 77.7, t: at4pm }] });
      return json({}, 404);
    },
  });
  for (const t of ['AAA', 'BBB', 'CCC', 'NOFH']) assert.equal(calls.finnhub[t], 1, `${t} asked once across both servers`);
  assert.equal(calls.prev, 1, 'only the ticker Finnhub could not confirm goes to /prev');
  for (const t of ['AAA', 'BBB', 'CCC']) assert.equal(stored[t].close_price, '100.500000');
  assert.equal(stored.NOFH.close_price, '77.700000');
  for (const t of ['AAA', 'BBB', 'CCC', 'NOFH']) assert.equal(stored[t].close_price_final, true);
  assert.ok(results.every((r) => !r.failed), 'a whole-market 429 does not abort the catch-up');
}

await db.end();
console.log('PASS: after-close catch-up');
}

main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
