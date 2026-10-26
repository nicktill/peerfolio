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

## Controlled cutover

The committed app/workflow configuration retires the four Vercel crons and the automatic GitHub prices/news/sports
schedules. Manual GitHub dispatch remains available. `DRY_RUN=1` is still the committed Worker default: merging this
configuration alone does not activate its replacement. The operator must complete this sequence in one controlled window:

1. Deploy this Worker in dry-run mode. Verify the deployed version, secret presence, schedule logs and CPU/error metrics.
   Tests compare every minute of an approved legacy timetable and all 2026 market-window starts, including both DST changes.
2. Merge/deploy the app configuration removing native Vercel crons; confirm the production deployment and Cron Jobs panel
   show no old triggers. Confirm GitHub prices/news/sports have no scheduled triggers or queued runs. Do this between due minutes.
3. Before the next due slot, explicitly deploy this same Worker with `DRY_RUN=0` as a deployment override. Do not change the
   committed safe default. Verify the active version and that due requests return HTTP 200. A dry-run deployment is not a live scheduler.
4. Observe a successful publish/settle cycle, the next price slot, and each next news/snapshot slot. Check stored Worker logs
   and app heartbeats. Exhausted critical retries reject the invocation; optional page warming remains noncritical.
5. Rollback: first restore Worker dry-run, then restore the old schedules or dispatch the affected GitHub job manually.
   Avoid extended overlap: duplicate work consumes Neon/provider budgets even where database writes are idempotent.

Cron Trigger changes may take up to 15 minutes to propagate. This cutover keeps the existing every-minute Worker trigger;
only its code/environment is activated after the old owners are verified off. Do not delete/re-add the trigger during cutover.

## Test

```bash
npm test      # node --experimental-strip-types, no dependencies
```

## Scheduler ownership

Cloudflare is the selected replacement for prices, news, snapshot, sports publish and sports settle. The exact legacy cadence
is preserved in `test/fixtures/legacy-schedules.json`; route-level market/quiet-hour gates remain unchanged. GitHub sports
publish, settle and latency are manual-only; `SPORTS_SCHEDULER`/`SPORTS_CRON_ENABLED` repository flags do not restore
an automatic GitHub owner. The continuous odds worker and the infrastructure budget workflow are separate.

The repository expresses the intended cutover configuration, not proof of the deployed owner. Check deployed Vercel Cron
Jobs, Cloudflare version/DRY_RUN/logs, and GitHub triggers before declaring migration complete.

## Retained delivery evidence

The Worker configuration enables persisted Workers Logs at full sampling, including invocation outcomes and the existing per-job HTTP status/attempt records. Authentication headers, response bodies and secrets are not logged. Confirm the deployed settings after the approved deployment; this configuration does not retroactively retain older invocations or send alerts.

Deploy the live scheduler with `npx wrangler deploy --var DRY_RUN:0` so the committed dry-run default does not interrupt ownership. Check the returned version, a due invocation's outcome and CPU time, and each due critical job's HTTP 200 in retained logs. Local `wrangler tail` output alone is temporary evidence.

## Live odds watchdog

`live-health` reads `/api/sports/live/health` at :01 and :31, 15:00-04:59 UTC, when `SPORTS_CRON_ENABLED` and
`LIVE_WATCHDOG_ENABLED` are both `"1"`. Settle and publish do database work on :00 and :30 in every band, so this read shares an
awake period instead of opening one. It replaces the GitHub schedule, whose runs started 10-25 minutes late and each woke Neon.

The verdict uses the app's `judgeHealth` (down, silent worker, repeated failed cycles; three reads 20 s apart). On failure the
invocation fails in Workers Logs and, if the optional secret is set, the Worker dispatches `.github/workflows/live-odds-watchdog.yml`
with the summary. That run fails at once and GitHub emails you, about one Actions minute per alert.

```bash
npx wrangler secret put WATCHDOG_GITHUB_TOKEN   # fine-grained token, this repository only, Actions: read and write
```

Without the secret, failures are only visible in Workers Logs. Deploy the Worker with this code before merging the workflow change,
or there is a gap with no watchdog.
