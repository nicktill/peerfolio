# Live odds worker: Cloudflare cutover checklist

Moves the 24/7 live odds worker from GitHub Actions (about 43,000 minutes a month) to the `LiveOdds` Durable Object, so the
repository can go private on GitHub's free 2,000 minutes. Nothing here runs without the owner's OK in chat. Each step says who
does it: **agent** steps need only that OK; **owner** steps are decisions or things only the owner can see.

Exactly one worker may own live odds at any time. Two would duplicate rows and double Neon wakes; none freezes markets.

## Phase 1: re-check the validation host (optional, before Nov 1)

The validation host passed on the older code. Re-run it on the merged code to catch adapter regressions before the trial.
Costs one short Neon wake (about 0.03 CU-hours).

1. **agent** `npx wrangler deploy --env validation` from this branch. It stays `DRY_RUN=1`, `LIVE_ODDS_ENABLED=0`.
2. **agent** Copy `DATABASE_URL` from Vercel into the validation Worker through stdin, `POST /preflight` with the validation
   control secret, expect `ok=true, tls=verified, readOnly=true, schemaTables=10`. Then `GET /status`: `enabled=false, armed=false`.
3. **agent** Delete the validation `DATABASE_URL` secret and confirm it is gone.

## Phase 2: supervised armed trial (after 2026-11-01 00:00 UTC)

Pick a weekday morning, 06:00-12:00 UTC: quiet hours, no live games, so a mistake costs little. Allow two hours.

**Decide first (owner):** how to reach `/start` and `/stop` on the production object. It has `workers_dev = false`, so it has no
URL. Recommended: turn on its workers.dev URL for the trial. Every control already requires `Bearer CRON_SECRET`.

### Before arming
1. **agent** Record the baseline: Neon CU-hours (`compute_time_seconds / 3600`), the current worker heartbeat from
   `/api/sports/live/health`, and the Durable Object usage graphs (empty).
2. **agent** Put `DATABASE_URL` and `CRON_SECRET` on `peerfolio-live-odds-prototype` through stdin. Never in arguments or logs.
3. **agent** Carry over any non-default Node switches (`SPORTS_DISABLED`, `SPORTS_EVENT_TRIGGER`, `LIVE_ODDS_BOOK_TS`).

### Handover (keep this under 10 minutes)
4. **agent** Set the GitHub variable `LIVE_ODDS_ENABLED=0`, then cancel the running and queued **Live odds worker** runs. Wait for
   the run to show cancelled.
5. **agent** `npx wrangler deploy --var DRY_RUN:0 --var LIVE_ODDS_ENABLED:1` (committed defaults stay safe), then `POST /start`.
6. **agent** `GET /status` shows `enabled=true, armed=true` and a `nextDue` within a minute.

### Verify (first hour)
7. **agent** `/api/sports/live/health` reports the new heartbeat, and the cron worker's watchdog logs `ok` at the next :01 or :31.
8. **agent** Open a sports page in the browser and confirm a watch wake: a fresh reprice within seconds, with no "worker not running" state.
9. **agent** Logs show a pregame reprice pass, kickoff locks and the retention pass; no `exceededCpu`, no recovery record.
10. **owner, optional** Place one small pick on a game later that day. Its settlement and cashout get checked when it finishes.
11. **agent** Restart test: deploy the same version again. That evicts the object. It must resume from its checkpoint within one
    alarm interval, with no duplicate rows and no reset settlement budgets.

### Verify (first 24 hours)
12. **agent** Neon: after the last game, starts and suspends follow the :00/:30 and hourly slots only. No new off-slot wakes.
13. **agent** Cloudflare free quotas, per UTC day: duration under **11,000 of 13,000 GB-s** (keep 15% margin), requests under 100,000,
    SQLite rows written under 100,000. If duration is above 11,000, stop and look at idle polling before going on.
14. **agent** Alarm continuity: no gap over 2 minutes in the heartbeat during live games.
15. **agent** Settlement of a finished game with open picks, through the worker trigger, not only the cron backup.

### Rollback (any failure, under 5 minutes)
- **agent** `POST /stop`, or redeploy with `LIVE_ODDS_ENABLED=0`.
- **agent** Set the GitHub variable `LIVE_ODDS_ENABLED=1` and dispatch the **Live odds worker** workflow by hand.
- **agent** Confirm the Node heartbeat in `/api/sports/live/health`. The odds markets recover on their own (#360).

## Phase 3: make it permanent (after 3-7 clean days)

1. **agent** Draft PR: remove the `schedule:` from `.github/workflows/live-odds-worker.yml` and keep `workflow_dispatch` for rollback.
2. **owner** Merge it. Then check GitHub Actions minutes for a few days: they should be well under 2,000 a month.
3. **owner** Make the repository private (Settings > General > Danger Zone). Vercel Hobby deploys private repos from a personal
   account. The commit-author rule applies only to organization-owned repositories.

## Risks to keep in mind

- **Thin daily quota.** An always-active 128 MB object uses about 10,800 GB-s a day, out of 13,000. Over the limit, the object
  stops until 00:00 UTC. Odds go stale, and markets freeze through the existing staleness rules, so picks stay protected. Still,
  sports would be degraded for the rest of that UTC day.
- **Rollback costs minutes once the repo is private.** One 6-hour GitHub worker run uses about 360 minutes, so 2,000 minutes cover
  about 5 days of fallback a month. Fix the Cloudflare host rather than living on the fallback.
- **Watchdog.** The cron worker's watchdog (every 30 minutes, in game hours) reads the same heartbeat. It needs no change for this cutover.
