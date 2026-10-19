# peerfolio-cron

One Cloudflare Worker with a single Cron Trigger (every minute, UTC). `src/schedule.ts` decides which of the app's cron
endpoints are due at that minute and `src/index.ts` calls them with the `CRON_SECRET` bearer token. It replaces the schedules
in `.github/workflows/{prices,news,sports}.yml` and the sub-daily crons in `apps/web/vercel.json`, so the repo can go private
and the Vercel project can drop to Hobby (daily crons only) without changing behaviour. See `~/Desktop/peerfolio-private.md`.

The endpoints are unchanged. The routes check the New York clock themselves, so (like the old GitHub schedules) the times
here are a UTC superset. Free plan limits fit comfortably: 1 Cron Trigger, about 1,440 runs a day, a few ms of CPU per run.

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
   disable the schedules in `prices.yml`, `sports.yml` and `news.yml` (keep `workflow_dispatch`). The live-odds worker is
   separate (see the plan).
4. Rollback: re-add the crons and schedules, set `DRY_RUN = "1"` or delete the Worker.

## Test

```bash
npm test      # node --experimental-strip-types, no dependencies
```
