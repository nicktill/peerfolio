# Live odds worker host (Fly.io)

Runs `apps/web/scripts/live-odds-worker.mts` around the clock, replacing `.github/workflows/live-odds-worker.yml`
(a GitHub-hosted job that would use about 42,000 Actions minutes a month once the repository is private; the free
allowance is 2,000). The code is unchanged apart from an optional `HEALTHCHECK_URL` ping.

**Cost:** one `shared-cpu-1x` machine with 512 MB, about **$3.69 a month** (fly.io pricing, checked 2026-10-23), plus
outbound data at $0.02/GB (this worker sends well under 1 GB a month). No dedicated IP: nothing listens. Fly has no free
tier for new accounts, so this is a new recurring cost. The free options were checked and ruled out (see the PR description).

## One-time setup (needs the owner: account, card, secrets)
```bash
brew install flyctl && fly auth signup        # or: fly auth login
fly apps create peerfolio-live-odds
fly secrets set --app peerfolio-live-odds \
  DATABASE_URL='<same value as the DATABASE_URL Actions secret>' \
  CRON_SECRET='<same value as the Actions secret>' \
  HEALTHCHECK_URL='<ping URL from healthchecks.io, period 1 min, grace 5 min>'
```
Monitoring: create a free check at healthchecks.io (period 1 minute, grace 5 minutes, email alert). The worker pings it
once a minute while its loop is making progress. A dead or hung worker stops pinging and you get an email. The ping
never touches Postgres, so monitoring cannot keep Neon awake. `/api/sports/live/health` stays the in-app view.

## Cutover (exactly one worker at a time)
1. Deploy, one machine only: `fly deploy --config infra/live-odds-worker/fly.toml --dockerfile infra/live-odds-worker/Dockerfile --ha=false`
2. Confirm it is the only one: `fly status --app peerfolio-live-odds` shows one machine; `fly logs` shows `live.start`.
3. Stop the Actions copy: `gh variable set LIVE_ODDS_ENABLED --body 0`, then cancel the running job:
   `gh run list --workflow live-odds-worker.yml --status in_progress` and `gh run cancel <id>` (queued runs too).
   The worker handles overlap safely for a few minutes (duplicate quote rows only), but do not leave both running.
4. Watch `/api/sports/live/health` and the Neon endpoint state: during quiet periods Neon should suspend after about 5 minutes.

## Rollback
`fly machine stop --app peerfolio-live-odds <id>` (or `fly scale count 0`), then `gh variable set LIVE_ODDS_ENABLED --body 1`
and `gh workflow run live-odds-worker.yml`. The Actions copy works only while the repository is public (or you pay for minutes).

## Restart, singleton, secrets
- `[[restart]] policy = "always"` restarts the process after a crash; the worker also exits 1 after 6 failed cycles so Fly restarts it.
- `kill_signal = SIGTERM`: the worker finishes its cycle and exits cleanly on deploy or stop.
- Singleton: one machine (`--ha=false`, never `fly scale count 2`). The worker keeps no database lock on purpose: holding a Postgres
  connection for a lock would keep Neon awake.
- Secrets live in `fly secrets` (encrypted, not in this repo). Rotating `CRON_SECRET` means updating Vercel, the Cloudflare Worker and here.
