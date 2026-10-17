# Live in-game odds (view only)

Pregame, offered prices refresh until kickoff and picks close server-side at kickoff. An accepted pick keeps its accepted price and payout forever. **During** the game the app shows a changing win probability plus score, period and clock, with an "as of" freshness chip. It is display only: no in-game picks, no cash-out, and nothing here feeds settlement. Settlement keeps using the independent results feeds, never an exchange quote.

## Pieces

| Piece | Where |
|---|---|
| Pure logic (matching, quote normalization, freshness, source reconciliation, wire parsers, retention policy, worker cycle) | `apps/web/src/lib/sports/live/` |
| Tables `live_quote`, `live_state` | migration `0030_live_odds.sql`, `src/db/schema.ts` |
| DB layer (insert, upsert, slate, read view, prune) | `src/lib/sports/live/store.ts` |
| Ingest worker (standalone process) | `apps/web/scripts/live-odds-worker.mts` |
| Read API (flag gated, cached 3s, per-IP limited) | `GET /api/sports/live/[gameId]` (`gameId` is `sports_events.id`) |
| UI | `src/components/sports/live-game.tsx`, rendered under an in-progress pick |
| Disposable-DB integration check | `apps/web/scripts/live-odds-integration.mts` |

## Data rules

- Win probability is the **mid of best bid and best ask** of each outcome's order book, never `last_trade_price`. One-sided, crossed, resolved (0/1) or very wide (> 20 points) books give no number.
- Freshness is the age of the quote, taken as the **older** of the source's book timestamp and our fetch time: under 30s **Live**, 30-120s **Delayed**, over 120s **stale**, which hides the probability and shows "Odds paused". The score and clock keep showing.
- Sources, in order of trust: Polymarket (Gamma list for score/period/clock + one batched CLOB `POST /books`, optional market WebSocket), Kalshi public REST as a cross-check and fallback (freshness is our fetch time, because market `updated_time` is unreliable), ESPN `summary.winprobability` as a last fallback (a model, capped at medium confidence).
- If the primary is stale the next fresh source is shown. If a second source differs by more than 8 points the primary is kept but marked low confidence ("sources differ"). Two order books more than 20 points apart pause the odds. A model (ESPN) can only warn.
- Games are matched on both team names (nickname/full-name aware, never city alone) and a start time within 3 hours; an ambiguous pairing is no match. Kalshi names NBA teams by city, so it uses a loose matcher plus a uniqueness check.

## Pregame repricing (offered odds refresh until kickoff)

Offered lines used to be fixed at publish and frozen on drift. Now the same worker reprices open moneyline markets from exchange mids until the scheduled start, while every accepted pick keeps its accepted price, point and total return forever. Code: decision in `src/lib/sports/reprice.ts` (pure), fetch/match/apply in `live/reprice-pass.ts`, the write in `applyReprice` (`store.ts`), history in `sports_line_history` (migration `0031_pregame_reprice`).

**Source and price convention.** Polymarket is primary (Kalshi is primary only when Polymarket has no match, and otherwise the cross-check; ESPN is never used). The fair probability is the mid of best bid and best ask of each outcome book, renormalised (never a last trade). The offered price is `priceTwoWay(fair)`, exactly as consensus publishing does it: half of a 4.5% margin added to each side, rounded to the nearest 5, no side under 10% fair. Exchange mids carry no vig (the two mids sum to about 1), so applying the app's margin gives the same house edge as before and payouts are not systematically richer. The Odds API consensus is still what publishes new markets (and what a market falls back to when the exchange is silent).

**Thresholds** (named constants in `REPRICE`, `reprice.ts`):

| Constant | Value | Meaning |
|---|---|---|
| `maxAgeMs` | 60s | our read of the book must be this fresh |
| `maxSpread` | 6 pts | widest bid/ask gap priced from |
| `maxBookTsAgeMs` | 10 min | a book timestamp older than this is a stuck feed |
| `disagree` | 5 pts | Polymarket vs Kalshi further apart: hold the current line |
| `minMove` | 1.5 pts | fair probability must drift this far from the last priced basis to write |
| `minIntervalMs` | 30s | at most one write per market in this time |
| `maxStep` | 8 pts | a bigger single move freezes the market (suspicious jump) |
| `hourRange` | 15 pts | total range of fair probability over an hour above this freezes it |
| `firstContactMax` | 12 pts | first exchange read vs the published consensus basis, else freeze |
| `staleFreezeMs` | 10 min | a market the exchange manages freezes if no good read arrives for this long |
| `windowMs` / `passMs` / `farPassMs` | 3h / 60s / 15 min | games inside 3h of the start are repriced every 60s, further out every 15 min |

**Mechanism.** The write happens in one transaction under the EXCLUSIVE market row lock, the same lock order as freezes and voids. Picks hold the shared lock, so a reprice waits for any pick being accepted, and every pick that starts later reads the new price. Pick placement now reads the line AFTER taking the market lock (before this change it read it first, which would have let a pick pass its price check against a price a reprice had just replaced). Inside the lock the write re-checks, on the server clock, that the market is open, unlocked and not started (kickoff is refused at the exact start instant), and is a compare-and-set on the basis the decision used, so a retry or a second worker changes nothing. It updates the two line rows in place (bumping `version`) and appends both prices to `sports_line_history` with source, spread and age; accepted picks copy price/point/total return and never read the line again. A client that submits an old price is refused with `The line moved to -165 since you opened it. Review the new price and try again`; the league page refetches every 20s, shows the slip at the latest price, flags "Price updated from X to Y", and refetches on that error.

**What reprices.** Moneylines with a Polymarket or Kalshi game-winner match. Spreads and totals are supported by the decision only at the EXACT offered point (no interpolation), but the worker does not yet fetch those exchange markets (their wire shape is unverified), so today they and all props stay on consensus + freeze. Markets with no exchange match keep the old behaviour exactly.

**Freezes (one-way).** Exchange jump, hourly range, first-contact disagreement, a lopsided price, the exchange showing the game in play before its scheduled start, and an exchange silent for 10 minutes on a market it manages. Feed failures on the Odds API side and disappearing markets still freeze as before; the consensus drift freeze is skipped only while the exchange confirmed the market within 15 minutes.

**Logs.** `sports.line_repriced` (old/new prices, fair, basis, step, source, spread, age, minutes to start), `sports.market_frozen_exchange`, `sports.reprice_skipped`, `live.reprice_hold` (throttled, with the reason and the exchange view), `live.reprice_pass` (counts). The heartbeat details carry a `reprice` summary.

**Credit impact.** The paid guard fetch (once per 2h per sport while any market is unlocked) no longer counts a market the exchange confirmed in the last 15 minutes, so a sport whose open markets are all exchange-managed spends only the 12 hour discover fetch (needed to publish new markets) instead of up to 12 guard fetches a day. Expect Odds API use to fall to roughly the discover fetches. Exchange calls are free.

**DB wake-ups.** Repricing keeps the worker active from 3 hours before the first start with an open market (60s passes: 2 reads and one batched exchange call) through the games; with open markets only further out it wakes every 15 minutes. Writes happen only when a price actually moves by 1.5 points or more (a handful per market per day), plus a confirm stamp at most every 5 minutes.

## Upstream load scales with games, not users

The worker polls only games whose `sports_events` row is `scheduled` and inside their live window (5 minutes before the start until 5h NFL / 4h NBA). Per 10s cycle: one Gamma list per live sport, one batched `/books` call for all live tokens, a Kalshi list per sport and ESPN fallbacks at most every 30s. Viewers only read Postgres through the API (3s in-process cache plus `s-maxage=3` at the CDN, per-IP limit of 120 requests a minute per instance, unknown game ids negative-cached for 60s with `s-maxage=30`, ids validated as UUIDs before any query).

**Freshness budget.** A row is written every tick (an unchanged book is rewritten, so the newest row is never more than one tick old; retention thins them afterwards). Worst-case displayed age is the sum of `PIPELINE` in `freshness.ts`: tick 10s + cycle 2s + book lag 2s + API cache 3s + CDN 3s + client poll 7s = 27s, under the 30s "live" cutoff, and a test keeps it there. Cache time is added to the reported ages (server-side for the in-process cache, via the `Age` header on the client), so a cached answer never looks fresher than it is.

## Database wake-ups (Neon compute)

The worker is built so a serverless Postgres can suspend between games. With nothing live it does not poll: it runs one cheap query for the next scheduled start, writes one heartbeat row, and sleeps until 10 minutes before that start (at most 15 minutes, so a start moved earlier is noticed within 15 minutes). That is at most 4 wake-ups an hour with nothing on, about 3 small queries each, and nothing at all if `LIVE_ODDS_ENABLED=0`. Within 10 minutes of a start it checks the slate every 30s; during games it queries every 10s (the database is busy anyway). Prune runs only when rows were written since the last prune. Expect Neon compute to be active roughly from 10 minutes before the first kickoff of a slate until the last game ends, instead of 24/7. Set `LIVE_ODDS_ENABLED=0` to turn the worker off completely (it idles without touching the database).

## Storage (free tier)

`live_quote` retention (`src/lib/sports/live/retention.ts`, run by the worker every 5 minutes): every row for the last 30 minutes, then one row per key per 5 minutes until 3 days, then only the latest row per key, and nothing for games older than 30 days. A key is (event, market, selection, source). `live_state` is one row per game, overwritten. Both tables cascade-delete with the event and are not referenced by picks, lines, markets, ledger or settlement.

## Running the worker

```
cd apps/web
DATABASE_URL=postgres://... node --experimental-strip-types scripts/live-odds-worker.mts [--ws] [--once]
```

Needs Node 22+ (type stripping, global `fetch`/`WebSocket`) and only `DATABASE_URL`. Run **one** replica; a second would only duplicate rows. `SIGTERM` finishes the cycle and exits. `LIVE_ODDS_ENABLED=0` idles it. It logs a one-line summary every minute.

Logs are one JSON object per line (`{"at","level","ev",...}`) on stdout; the process exits 1 after 6 consecutive total failures (about a minute) so a supervisor restarts it. Health without logs: `GET /api/sports/live/health` with `Authorization: Bearer $CRON_SECRET` (200 ok/degraded, 503 down).

It must be a persistent process, not a Vercel function. Any of these works:

- **GitHub Actions (free, recommended to start)**: `.github/workflows/live-odds-worker.yml`. The repository is public, so Actions minutes are free. Turn it on:
  1. Repository secret **`DATABASE_URL`** (Settings > Secrets and variables > Actions > Secrets): the app's Postgres URL. The workflow reads it and nothing else.
  2. Repository variable **`LIVE_ODDS_ENABLED`** = `1` (Variables tab). Scheduled runs skip unless it is `1`; "Run workflow" (workflow_dispatch) works regardless, which is how to start one immediately.
  3. Optional variable `LIVE_ODDS_BOOK_TS` = `fetch` (see the checklist).
  To turn it off set `LIVE_ODDS_ENABLED` to anything else and cancel the running job.
  Caveats: GitHub's scheduler is best effort and often starts runs 5 to 30 minutes late; a job is capped at 6 hours, so it runs `timeout 5h50m` and a new one is scheduled every 6 hours (05:20, 11:20, 17:20, 23:20 UTC), which leaves a **handover gap of roughly 10 to 40 minutes** with no worker (live odds show "Odds paused" if a game falls inside it; the score and everything else are unaffected). The concurrency group guarantees two workers never overlap and never cancels a running one. If a game is on during a gap, press "Run workflow" to start one straight away (it queues behind the running job, so only when none is running). Scheduled workflows are disabled by GitHub after 60 days without repository activity on public repos. A job failing (the worker exits 1 after repeated total failures) shows as a failed run and sends GitHub's usual failure email. While idle the worker sleeps, so the runner is mostly waiting, which still costs nothing on a public repo.
- **Fly.io**: a small app (shared-cpu-1x, 256 MB) with `[processes] worker = "node --experimental-strip-types apps/web/scripts/live-odds-worker.mts --ws"`, `auto_stop_machines = false`, one machine, secret `DATABASE_URL`. Build from the repo root with a Node 22 image and `npm ci --workspaces`.
- **Railway**: a service from the same repo, root directory the repo root, start command as above, variable `DATABASE_URL`.
- **VPS**: a systemd unit with `Restart=always`, `Environment=DATABASE_URL=...`, `ExecStart=/usr/bin/node --experimental-strip-types scripts/live-odds-worker.mts --ws`, `WorkingDirectory=.../apps/web`.

Use the app's normal pooled `DATABASE_URL` (the worker opens at most 2 connections and uses `prepare: false`, so a transaction-mode pooler is fine). The worker has no inbound port. Enable the UI by building the web app with the existing sports flag on; the live strip only appears under an open pick whose game has started.

## Verified and unverified

Verified with real endpoints: Gamma list shape and moneyline parsing, `POST /books` batching (bids arrive unsorted, so top of book is a max/min), the market WebSocket subscribe/PING/book flow, and one live NHL game for socket and REST behavior. Not verified: any live NFL or NBA game (no game was on), the orientation of Polymarket's `score` string (assumed to follow the title/outcome order), `price_change` message field names beyond `best_bid`/`best_ask`, the Kalshi event title format for every team, and tennis (no Polymarket game series is configured, so tennis shows score-less "Odds paused" until a source is added).

## Tomorrow's live-test checklist

**Before kickoff (about 13:00Z)**
1. Migrations are applied (`live_quote`, `live_state`, `live_worker` exist) and the sports flag is on.
2. Smoke the worker against the real database once: `cd apps/web && DATABASE_URL=... node --experimental-strip-types scripts/live-odds-worker.mts --once`. It runs one cycle and exits 0 (1 if the cycle totally failed). Before games it prints no `live.cycle` line and a `live.start`; that is normal. Then start it for real with `--ws` (or without) as a single replica.
3. `curl -s -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/sports/live/health`: expect `"status":"ok"` and the worker's `lastCycleAgeMs` small (or `sleepUntil` in its details while idle).

**During games, watch**
- `live.cycle` every 10s: `games`, `matched`, `unmatched`, per-source `{ok,fail,ms}`, `rows.written`, `quoteAgeMs`.
- `live.no_quotes` / health `unmatched`: a game with no exchange match, with the reason (`no_name_match`, `only_one_team_matches`, `time_outside_tolerance(gap_min=..)`, `ambiguous_candidates`, `polymarket_unavailable`, `no_series_for_sport` for tennis).
- `live.odds_paused`, `live.low_confidence`, `live.source_mismatch`: what a viewer is being shown.
- `live.book_clock`: **the answer to "what does the CLOB book timestamp mean"**. For a live, quiet book compare `sourceAgeMs` (age of the book's own timestamp) with `changeAgeMs` (how long ago the book last changed, by our own tracking). If `sourceAgeMs` stays small while `changeAgeMs` grows, the timestamp is the snapshot time. If both grow together on a quiet book, it is the time of last change; then set `LIVE_ODDS_BOOK_TS=fetch` and restart so quiet-but-live books are not paused (default is `strict`).
- `live.backoff_start` / `live.backoff_end`: a source erroring and recovering.
- `sports.pick_rejected_kickoff` (warn): a pick refused only because kickoff arrived before the market lock. It should be rare; each line shows `eventStartsAt`, `lockAt`, `now`.
- `live.api` (route): cache fill lines with `outcome` served_odds / served_paused / missing_game.

**Example lines**
```
ok:   {"at":"2026-10-18T13:41:10.2Z","level":"info","ev":"live.cycle","worker":"live-odds","games":3,"matched":3,"unmatched":0,"sources":{"polymarket":{"ok":2,"fail":0,"ms":410},"kalshi":{"ok":1,"fail":0,"ms":180}},"skippedBackoff":0,"rows":{"written":12,"skipped":0},"stateWrites":3,"quoteAgeMs":{"min":300,"max":1900}}
warn: {"at":"...","level":"warn","ev":"live.no_quotes","game":"Detroit Pistons @ Boston Celtics","sport":"nba","reason":"time_outside_tolerance(gap_min=4320)"}
fail: {"at":"...","level":"warn","ev":"live.backoff_start","source":"polymarket","forMs":30000,"error":"503 gamma-api.polymarket.com/events"}
fail: {"at":"...","level":"error","ev":"live.cycle","games":3,"matched":0,"unmatched":3,"sources":{"polymarket":{"ok":0,"fail":1,"ms":8002}},"skippedBackoff":0,"rows":{"written":0,"skipped":0}}
fatal:{"at":"...","level":"error","ev":"live.fatal","reason":"6 consecutive total failures","exiting":true}
```

**Verify score orientation (home/away) for a live game**
1. In the worker log find `live.orientation` for the game: it shows `ourHome`, `ourAway`, the exchange's `feedTeams` order, the raw `scoreRaw` (e.g. `"50-54"`), `feedHomeIndex` (which feed team is our home), and `interpreted` `{home,away}`. The assumption to confirm is that Polymarket's score reads `first team - second team` in `feedTeams` order.
2. Compare against ESPN: `curl -s https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard` (or `football/nfl`) and read the live event's two `competitors`, each with `homeAway` and `score`. Our `interpreted.home` must equal ESPN's `home` competitor score and `interpreted.away` the `away` one.
3. Then check the app: the strip shows `AWAY score - HOME score`. If it is swapped, the fix is in `pmGameState`/`orientScore` (`sources.ts`/`match.ts`) and no stored data is affected.
