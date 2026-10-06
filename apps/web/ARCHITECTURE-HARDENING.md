# Hardening: deployment and regression checks

Addresses the nine review findings; fantasy trading rules are unchanged. No production database changes have been performed.

## Required migration-before-deploy sequence

1. Use a migrated preview database for functional testing. An unmigrated preview cannot exercise this branch.
2. Finish the normal nightly snapshot, take a recoverable Neon backup, and use a quiet window with account edits/linking paused.
3. Apply migration 0014 through the normal Drizzle command. Changes are additive and compatible with the old app. Confirm seeded `portfolio_flow_baselines` dates match each user's latest existing snapshot. No historical snapshots/flows are rewritten.
4. Deploy the new app in the same UTC day. Do not leave the old app writing later snapshot dates between migration and deployment: those legacy flows lack deduplication IDs. Revisit baselines if the rollout window slips.
5. Confirm Vercel Fluid Compute supports the 300-second job declaration. The existing GitHub workflow waits for resumable work; no Vercel cron is added.
6. Check actual Portfolio balances, reconnect, edits/import/replace/delete, ranks, and job `healthy`/`pending` outcomes. Verify production preview URLs remain 404.

Legacy transaction IDs cannot be reconstructed from snapshot totals, so old returns are preserved rather than repaired. Transactions on/before the cutover date are excluded from new ingestion. A linked Item has a link-day baseline because its initial balance already includes earlier transactions. Same-day changes around cutover/linking need care: Plaid supplies dates rather than intraday timestamps. This is why rollout needs a quiet post-snapshot window. Historical repair needs its own reviewed migration.

Late transactions are applied to the current snapshot on discovery, preserving the existing convention rather than rewriting historical returns. Jobs resume within their UTC day; unfinished prior-day work is exposed as overdue instead of synthesizing yesterday's balances.

## New boundaries

Portfolio mutations, flow deltas and snapshots share a user lock/serializable transaction. Pricing is reconciled before structural flow brackets. Retries roll back the whole operation and clone the request body. Provider price/Plaid calls finish before holding a DB connection.

Plaid ingestion reads all pages, deduplicates IDs, retains failed cursors, and overlaps seven days for late postings. Delayed provider payloads cannot overwrite newer completed refreshes. Atomic price predicates compare the current row's session, print timestamp and official-close precedence. Checking/claiming cannot refresh a fill timestamp. Only accepted securities are revalued.

Snapshot steps have expiring claims and resume via the existing price job. Institution progress and bounded integrity batches reduce restart work. Integrity reads use one repeatable snapshot. Required failures affect HTTP health. Plaid disconnect/delete queues an encrypted retry token before deleting local data; successful removal or an already-invalid token/item erases it.

Portfolio/league reads return stored values and schedule globally leased repair after response. Rank pills batch inputs without loading unused holdings/reactions. Fantasy charts are sampled to about 360 points/member while retaining exact frozen scores and day counts. Game rules are unchanged.

## Import budget

`IMPORT_AI_MONTHLY_BUDGET_USD` defaults to `1`, separately from News. `0` disables paid AI while CSV/table/manual imports remain available. Invalid/negative values fail closed. Shared reservations also enforce 12 attempts/user/hour; worst-case reservations remain counted even for failed or short calls.

The pinned Haiku 4.5 bound includes UTF-8 input bytes, system/tool overhead and all 8,192 output tokens at $1/M input and $5/M output. Recheck before changing models/prices: https://platform.claude.com/docs/en/about-claude/pricing. Reservations are retained for two months; checkpoints for 30 days. No new paid service or credential is required. Actual Neon compute depends on real usage and polling.

## Checks

From apps/web: `npx tsc --noEmit`, `npx eslint src --max-warnings 0`, `npm test`, `npm run test:hardening`, `npm run build`.

The new Docker-based command creates/removes its own disposable local Postgres, overrides production database credentials, mocks identity/Plaid, and forbids outside HTTP except a mocked quote. It runs in PR CI with the existing import/close smoke scripts; their original assertions are retained.

Coverage includes migration cutover, concurrent edits/rollback, ownership rejection, duplicate paginated deposits/returns, delayed Plaid responses, repeated imports/failed replace, price ordering/cache freshness, concurrent leases/budgets, interrupted/resumed snapshots, removal after user deletion, bounded charts with exact scores, and simultaneous fills with exact cash/shares and a clean ledger audit.

Real institutions, provider latency, deployment settings and a migrated functional preview still need rollout checks. Passing tests reduces risk; it cannot prove zero regressions.
