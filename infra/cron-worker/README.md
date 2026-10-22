# peerfolio-cron

One Cloudflare Worker with a single Cron Trigger (every minute, UTC). `src/schedule.ts` decides which of the app's cron
endpoints are due at that minute and `src/index.ts` calls them with the `CRON_SECRET` bearer token. It replaces the schedules
in `.github/workflows/{prices,news,sports}.yml` and the sub-daily crons in `apps/web/vercel.json`, as one step toward a private repository and Vercel Hobby (daily crons only). The separate continuous live-odds worker must
also move out of private GitHub Actions, and measured Vercel usage must fit Hobby before either change.

The endpoints are unchanged. The routes check the New York clock themselves, so (like the old GitHub schedules) the times
here are a UTC superset. The current price schedule is every 15 minutes during its UTC session superset, including the winter close-capture
windows; the app applies its market calendar. Sports publish and settle share each quarter-hour. This scheduler alone
uses about 1,440 trigger invocations/day. Measure CPU and retries against the Worker account limits before cutover.
Calling Vercel still consumes Vercel function resources and may wake Neon; moving the timer does not move that work.

## It ships in log-only mode

`DRY_RUN = "1"` in `wrangler.toml`: it logs what it would call and calls nothing. Nothing changes in production until you
flip it.

## Deploy

```bash
cd infra/cron-worker
npm install
npx wrangler login                # opens a browser, approve once
npx wrangler secret put CRON_SECRET   # paste the same value the app and GitHub use; typed at a prompt, never committed
npx wrangler deploy               # deploys in DRY_RUN mode
npx wrangler tail                 # watch the "would call" lines for a day
```

## Cut over (in this order)

1. Dry run for a day: compare the Worker's log lines with what GitHub Actions and Vercel actually ran.
2. Set `DRY_RUN = "0"` in `wrangler.toml` and `npx wrangler deploy`. Both the old schedulers and the Worker now run.
   Settle and publish already tolerate overlapping callers; confirm prices, news and snapshot do too before leaving this on.
3. After 2 to 3 healthy days: remove the sports crons (and optionally snapshot and news) from `apps/web/vercel.json`, and
   disable the schedules in `prices.yml` and `news.yml` (keep `workflow_dispatch`). Keep `SPORTS_SCHEDULER` unset so the
   GitHub sports publish/settle jobs stay off; latency measurement is a separate opt-in. The live-odds worker is separate.
4. Rollback: re-add the crons and schedules, set `DRY_RUN = "1"` or delete the Worker.

## Test

```bash
npm test      # node --experimental-strip-types, no dependencies
```

## Current automatic sports owner

Vercel remains authoritative: `/api/cron/sports/publish` and `/api/cron/sports/settle` run every 15 minutes.
The GitHub workflow requires **both** `SPORTS_SCHEDULER=github` and `SPORTS_CRON_ENABLED=1` for automatic publish/settle.
Without the new scheduler selection, the old GitHub flag alone no longer duplicates those Vercel calls. Manual GitHub
publish/settle/latency dispatches remain available. This removes up to two redundant scheduled requests per quarter-hour (192/day when
all scheduled runs execute with the old flag enabled), plus retries; it does not change pricing, live ingestion or the authoritative settlement cadence.
Scheduled GitHub runs may still occur for the independently enabled latency measurement.

For a deliberate GitHub replacement instead of Cloudflare: set both variables, verify successful runs, then remove only
Vercel's sports crons. GitHub is best effort and may start late, so it is not a precise market-open executor. For rollback,
restore the Vercel crons and unset `SPORTS_SCHEDULER`. Do not leave two automatic owners indefinitely.

Merging this directory does not deploy the Worker. `DRY_RUN=1` remains the committed default. A deployed older Worker
keeps its older schedule until explicitly redeployed; verify its version and log-only setting before any cutover.
