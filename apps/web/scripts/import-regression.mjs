import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
/**
 * Database regression smoke test: executes the real positions service, stubbing
 * only server-only/auth imports. Network calls are counted and forbidden.
 *
 * docker run --rm -d --name peerfolio-import-regression -e POSTGRES_PASSWORD=regression -e POSTGRES_DB=regression -p 127.0.0.1:55439:5432 postgres:16-alpine
 * IMPORT_TEST_DATABASE_URL=postgres://postgres:regression@127.0.0.1:55439/regression node apps/web/scripts/import-regression.mjs
 * docker stop peerfolio-import-regression
 *
 * Requires installed workspace dependencies (esbuild is supplied by drizzle-kit).
 * Never point this at an existing development database: use a disposable instance.
 */
async function main() {
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const postgres = require('postgres');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const temp = await mkdtemp(path.join(tmpdir(), 'peerfolio-import-test-'));
// Intentionally refuse production databases. Start a disposable local Postgres first.
const url = process.env.IMPORT_TEST_DATABASE_URL;
if (!url) throw new Error('Set IMPORT_TEST_DATABASE_URL to a disposable local Postgres database named regression');
const target = new URL(url);
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/regression') throw new Error('Tests require local /regression database');
const sql = postgres(url, { onnotice: () => {} });
await sql.unsafe(`CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), source text DEFAULT 'manual', name text, current_balance numeric(20,4), updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS securities(id text PRIMARY KEY, ticker_symbol text, name text, type text, close_price numeric(20,6), close_price_as_of date, previous_close numeric(20,6), iso_currency_code text DEFAULT 'USD', market_ticker text, updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS holdings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid REFERENCES accounts(id),user_id uuid REFERENCES users(id),security_id text REFERENCES securities(id),quantity numeric(24,8),cost_basis numeric(20,4),institution_value numeric(20,4),iso_currency_code text DEFAULT 'USD',updated_at timestamptz DEFAULT now(), UNIQUE(account_id,security_id));
CREATE TABLE IF NOT EXISTS fantasy_positions(security_id text);`);
await sql.unsafe('TRUNCATE holdings, fantasy_positions, accounts, securities, users CASCADE');
await sql.end();
await build({entryPoints:[root+'/apps/web/src/lib/positions.ts'],outfile:path.join(temp,'positions.cjs'),bundle:true,platform:'node',format:'cjs',nodePaths:[path.join(root,'node_modules')],tsconfig:root+'/apps/web/tsconfig.json',plugins:[{name:'test-isolation',setup(b){
b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'stub'}));
b.onResolve({filter:/^@web\/lib\/api$/},()=>({path:'api',namespace:'stub'}));
b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='api'?'export class ApiError extends Error { constructor(message,status=400,details){super(message);this.status=status;this.details=details;} }':'',loader:'js'}));
}}]});
process.env.DATABASE_URL=url;
for(const key of Object.keys(process.env)) if(/API_KEY|API_SECRET/.test(key))delete process.env[key];
let providerCalls = 0;
globalThis.fetch=()=>{providerCalls++;throw new Error('Unexpected provider network request')};
const {importPositions,setPosition,repricePositions,refreshStalePrices}=require(path.join(temp,'positions.cjs'));
const assert=require('node:assert/strict');
const db=postgres(url);
const [{id:user}]=await db`INSERT INTO users DEFAULT VALUES RETURNING id`;
const [{id:a}]=await db`INSERT INTO accounts(user_id,name) VALUES(${user},'Test A') RETURNING id`;
const [{id:b}]=await db`INSERT INTO accounts(user_id,name) VALUES(${user},'Test B') RETURNING id`;
const row={symbol:'66585Y356',kind:'stock',name:'LSV US LARGE CAP CIT',quantity:104.866,price:30.15,avgCost:2904.55/104.866};
const state=async(id)=>{const [v]=await db`SELECT h.*,s.market_ticker,s.close_price FROM holdings h JOIN securities s ON s.id=h.security_id WHERE account_id=${id}`;return v;};
let result=await importPositions(a,user,[row],{replace:false});assert.equal(result.imported,1);assert.deepEqual(result.fromFile,[row.symbol]);assert.equal((await state(a)).market_ticker,null);assert.equal((await state(a)).cost_basis,'2904.5500');
await importPositions(b,user,[{...row,price:45}],{replace:false});assert.equal((await state(a)).close_price,'30.150000');assert.equal((await state(b)).close_price,'45.000000');
await importPositions(a,user,[{...row,price:31,quantity:100}],{replace:false});assert.equal((await state(a)).quantity,'100.00000000');assert.equal((await state(a)).institution_value,'3100.0000');assert.equal((await db`SELECT count(*) FROM holdings WHERE account_id=${a}`)[0].count,'1');
result=await importPositions(a,user,[{...row,symbol:'84679P405',price:null}],{replace:true});assert.equal(result.failed.length,1);assert.equal(result.removed,0);assert.ok(await state(a));
result=await importPositions(a,user,[{...row,symbol:'92202V120',price:54.95}],{replace:true});assert.equal(result.removed,1);assert.equal((await state(a)).security_id,`file:${a}:92202V120`);
await repricePositions();await refreshStalePrices({minIntervalMinutes:0});assert.equal((await state(a)).close_price,'54.950000');
await setPosition(a,user,{symbol:'92202V120',kind:'stock',quantity:20,avgCost:40.123456});
assert.equal((await state(a)).institution_value,'1099.0000');
assert.equal((await state(a)).cost_basis,'802.4691');
assert.equal((await db`SELECT current_balance FROM accounts WHERE id=${a}`)[0].current_balance,'1099.0000');
assert.equal((await state(b)).close_price,'45.000000');
await assert.rejects(setPosition(b,user,{symbol:'92202V120',kind:'stock',quantity:1}), /import|file/i);
await db`INSERT INTO securities(id,ticker_symbol,type,market_ticker,close_price,close_price_as_of) VALUES('mkt:AAPL','AAPL','equity','AAPL',250,'2026-09-29') ON CONFLICT(id) DO UPDATE SET close_price=250`;
result=await importPositions(a,user,[{symbol:'AAPL',kind:'stock',quantity:2,avgCost:200,price:1}],{replace:false});
assert.equal(result.imported,1);
assert.equal((await db`SELECT close_price FROM securities WHERE id='mkt:AAPL'`)[0].close_price,'250.000000');
assert.equal((await db`SELECT current_balance FROM accounts WHERE id=${a}`)[0].current_balance,'1599.0000');
result=await importPositions(a,user,[{...row,symbol:'84679P405',price:null},{symbol:'AAPL',kind:'stock',quantity:3}],{replace:true});
assert.equal(result.failed.length,1);assert.equal(result.imported,1);assert.equal(result.removed,0);
assert.equal((await db`SELECT count(*) FROM holdings WHERE account_id=${a}`)[0].count,'2');
assert.equal(providerCalls,0,'File-only holdings must never call a market provider');
console.log('PASS: file identifiers, exact basis rounding, account isolation, reimport, replace, partial failure and refresh exclusion');
await db.end();await rm(temp,{recursive:true,force:true});process.exit(0);

}
main().catch(error => { console.error(error); process.exit(1); });
