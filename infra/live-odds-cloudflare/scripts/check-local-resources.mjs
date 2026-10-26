import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
const require = createRequire(new URL('../package.json', import.meta.url))
const { build } = require('esbuild')
const { Miniflare, convertV4MiniflareOptions } = require('miniflare')
const out = await mkdtemp(join(tmpdir(), 'peerfolio-resource-'))
let mf
try {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../test/resource-fixture.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['cloudflare:workers', 'node:*'] })
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'], durableObjects: { FIXTURE: { className: 'ResourceFixture', useSQLite: true } }, durableObjectsPersist: out }))
  for (const mb of [8, 20]) {
    const response = await mf.dispatchFetch(`http://local.test/check?mb=${mb}`)
    const body = await response.json()
    console.log(JSON.stringify({ inputMB: mb, ...body }))
    assert.equal(response.status, 200, JSON.stringify(body))
    assert.equal(body.first.failed, false)
    assert.equal(body.second.failed, false)
    assert.equal(body.first.slate, 11)
    assert.equal(body.quotes, 44)
    assert.equal(body.states, 22)
    assert.equal(body.repriced, 22)
    assert.equal(body.roundtrip, true)
    assert.ok(body.cacheBytes < 100_000)
    assert.ok(body.checkpointBytes < 100_000)
  }
} finally {
  await mf?.dispose()
  await rm(out, { recursive: true, force: true })
}
