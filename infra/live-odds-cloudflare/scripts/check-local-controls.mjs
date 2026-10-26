import assert from 'node:assert/strict'
import { createRequire, builtinModules } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(new URL('../package.json', import.meta.url))
const { build } = require('esbuild')
const { Miniflare, convertV4MiniflareOptions } = require('miniflare')
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['cloudflare:workers', 'node:*'], plugins: [{ name: 'node-builtins', setup(b) { b.onResolve({ filter: /^[a-z_]+$/ }, (args) => builtinModules.includes(args.path) ? { path: `node:${args.path}`, external: true } : undefined) } }] })
const bindings = { DRY_RUN: '1', LIVE_ODDS_ENABLED: '0', APP_URL: 'https://www.peerfolio.org', CRON_SECRET: 'local-control-fixture' }
const config = (vars) => convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'], durableObjects: { LIVE_ODDS: { className: 'LiveOdds', useSQLite: true } }, bindings: vars })
const mf = new Miniflare(config(bindings))
const auth = { authorization: `Bearer ${bindings.CRON_SECRET}` }
try {
  const status = await mf.dispatchFetch('http://local.test/status', { headers: auth })
  assert.deepEqual(await status.json(), { enabled: false, armed: false, at: 0, nextDue: 0 })
  const start = await mf.dispatchFetch('http://local.test/start', { method: 'POST', headers: auth })
  assert.equal(start.status, 409)
  const denied = await mf.dispatchFetch('http://local.test/preflight', { method: 'POST' })
  assert.equal(denied.status, 401)
  const probe = await mf.dispatchFetch('http://local.test/preflight', { method: 'POST', headers: auth })
  assert.equal(probe.status, 503)
  assert.deepEqual(await probe.json(), { ok: false, error: 'Database preflight failed' })
  assert.equal(probe.headers.get('cache-control'), 'no-store')
  const after = await mf.dispatchFetch('http://local.test/status', { headers: auth })
  assert.equal((await after.json()).armed, false)
  await mf.setOptions(config({ ...bindings, DRY_RUN: '0', LIVE_ODDS_ENABLED: '1' }))
  const gated = await mf.dispatchFetch('http://local.test/preflight', { method: 'POST', headers: auth })
  assert.equal(gated.status, 409)
  console.log('PASS: disabled start, preflight authentication, sanitized missing-DB failure, no activation, and live-intent probe refusal in workerd. No database or production requests.')
} finally {
  await mf.dispose()
}
