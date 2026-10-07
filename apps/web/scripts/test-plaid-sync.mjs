// Uses a disposable database only; Plaid calls are stubbed, never sent over the network.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outfile = path.join(root, `.plaid-sync-test-${process.pid}.mjs`)
if (process.env.PLAID_TEST_DATABASE_URL !== 'postgresql://postgres:plaid-test@127.0.0.1:55433/plaid_test') {
  throw new Error('Use the disposable plaid_test Postgres instance on localhost:55433')
}
try {
  await build({ entryPoints: [path.join(root, 'scripts/plaid-sync.integration.ts')], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'mock-plaid', setup(b) {
    b.onResolve({ filter: /^next\/server$/ }, () => ({ path: 'next/server.js', external: true }))
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'stub' }))
    b.onResolve({ filter: /^plaid$/ }, () => ({ path: 'plaid', namespace: 'stub' }))
    b.onResolve({ filter: /^@web\/lib\/use-api$/ }, () => ({ path: 'use-api', namespace: 'stub' }))
    b.onResolve({ filter: /^@web\/lib\/api$/ }, () => ({ path: 'api', namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path: p }) => ({ contents: p === 'server-only' ? '' : p === 'use-api' ? `export const mutate = async (url, options) => { globalThis.plaidTestMutation = {url, options}; return {result: {status: 'active'}} };` : p === 'api' ? `
      export class ApiError extends Error { constructor(message,status=400) {super(message);this.status=status} }
      export const readJson = r => r.json();
      export const withUser = fn => (r,c) => fn(globalThis.plaidTestUser, r,c);
    ` : `
      export class Configuration {}
      export const PlaidEnvironments = {sandbox:'sandbox',production:'production'};
      export const CountryCode = {Us:'US'};
      export const Products = {Investments:'investments'};
      export class PlaidApi { constructor() { return globalThis.plaidTestClient } }
    ` }))
  } }] })
  const result = spawnSync(process.execPath, [outfile], { cwd: root, stdio: 'inherit', env: { ...process.env, DATABASE_URL: process.env.PLAID_TEST_DATABASE_URL, ENCRYPTION_KEY: 'a'.repeat(64), PLAID_CLIENT_ID: 'test', PLAID_SECRET: 'test', PLAID_ENV: 'sandbox', ENABLE_PLAID_SANDBOX: 'true' } })
  process.exitCode = result.status ?? 1
} finally { await unlink(outfile).catch(() => {}) }
