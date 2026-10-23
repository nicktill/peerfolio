# Cloudflare live odds candidate

Not deployed or activated. `DRY_RUN=1`, `LIVE_ODDS_ENABLED=0`, and `workers_dev=false` are committed defaults. Keep the Node worker active until rollout verification passes. This is a candidate implementation, not evidence that production migration is complete.

## Implementation

A single named SQLite Durable Object invokes the same `createWorkerRunner` cycle as the Node process. This includes quiet mode, repricing, kickoff locks, retention, heartbeat, failure bookkeeping and settlement triggers. REST feeds remain the default. Authenticated `/start`, `/stop` and `/status` routes control one singleton; alarm operations are serialized with controls.

Connections are lazy and closed after every alarm. Idle watch probes call the app cache every 30 seconds without SQL; a changed mark wakes the cycle immediately. Quiet exit clears quote/state persistence bookkeeping so the first active cycle writes a fresh database snapshot. Failed watch requests leave normal scheduled polling operational.

A single bounded checkpoint retains Date/Map values, slate eligibility, lock/prune state and settlement trigger budgets. Raw upstream caches are excluded. Recovery resets transient settlement in-flight flags. Checkpoints exceeding 1 MB fail visibly rather than silently discard state. Failures persist a visible recovery record and schedule a new supervisor attempt with exponential backoff capped at 15 minutes, so six exhausted platform retries cannot silently stop ordinary recovery. Storage failures still rely on platform retries; an external watchdog remains required.

## Verified locally

- Real workerd uses existing postgres-js + Drizzle against a disposable PostgreSQL schema.
- The actual shared cycle completes with an empty database, writes its heartbeat, and round-trips its checkpoint through DO SQLite without changes; a second SQL cycle on the same adapter reopens connections after close.
- Original Node `--once` runner still completes against that disposable schema.
- Default-disabled authenticated `/start` returns 409; `/status` shows unarmed.
- Shared tests cover quiet no-SQL cycles, viewer wake, kickoff locks, first persisted snapshot after quiet, bounded state cleanup, restart recovery and settlement in-flight recovery.

Run repository `npm ci` first, then `npm ci` in this folder. `npm run build` bundles without deploying. `../../node_modules/.bin/tsc -p tsconfig.json` checks the adapter.

For an independently migrated disposable local database:

```
npx wrangler dev --local --port 8797 --var 'LOCAL_DATABASE_URL:postgres://postgres:disposable@127.0.0.1:55439/cloudflare_worker_check' --var CRON_SECRET:local-disabled-smoke-only
curl http://localhost:8797/local-db-smoke
curl http://localhost:8797/local-core-smoke
curl http://localhost:8797/local-cycle-smoke
```

The smoke routes require a local variable; SQL routes accept only loopback database hosts. Never configure `LOCAL_DATABASE_URL` on a deployed worker.

## Free quota and CPU interpretation

Official [pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [limits](https://developers.cloudflare.com/durable-objects/platform/limits/) distinguish Durable Object invocation CPU (30 seconds by default, including alarms) from the stateless Free Worker request CPU limit. JSON parsing and cycle work happen inside the DO alarm, not in the forwarding Worker.

The Free account allocation is 100,000 requests/day, 13,000 GB-seconds/day and 100,000 SQLite rows written/day. A continuously active 128 MB singleton is approximately 10,800 GB-seconds/day; 10-second polling is 8,640 alarms/day. These are feasibility calculations. Measure actual duration, CPU outcomes, metadata/checkpoint row writes and other account usage; keep margin.

## Required before cutover

- Real deployed disabled-worker TLS connectivity to Neon, without logging credentials, and a read-only schema check. Local TCP is proven; deployed TLS is not.
- Full active multi-sport cycles and repricing against controlled fixtures, including worst-case 8–20 MB Gamma responses in the 128 MB isolate and six concurrent outbound connections.
- Deployed alarm/restart/failure tests and quiet-period proof that no SQL runs until the next refresh, kickoff or viewer wake.
- Watchdog activation, visible exhausted-retry alerts, quota headroom and agreed rollback.
- Confirm exactly one active host: stop/cancel GitHub workers before arming the replacement; verify heartbeat and live pricing, picks, cashout and settlement, with Node rollback available.

No production secrets are included. Enable variables and arm the object only after these checks pass. Preserve nondefault Node feature switches (including `SPORTS_DISABLED`, `SPORTS_EVENT_TRIGGER`, and `LIVE_ODDS_BOOK_TS`) in Cloudflare settings at cutover; optional Node WebSocket mode is not ported here.
