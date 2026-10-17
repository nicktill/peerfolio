# Live in-game odds (view only)

Pregame, offered prices refresh until kickoff and picks close server-side at kickoff. An accepted pick keeps its accepted price and payout forever. **During** the game the app shows a changing win probability plus score, period and clock, with an "as of" freshness chip. It is display only: no in-game picks, no cash-out, and nothing here feeds settlement. Settlement keeps using the independent results feeds, never an exchange quote.

## Pieces

| Piece | Where |
|---|---|
| Pure logic (matching, quote normalization, freshness, source reconciliation, wire parsers, retention policy, worker cycle) | `apps/web/src/lib/sports/live/` |
| Tables `live_quote`, `live_state` | migration `0030_live_odds.sql`, `src/db/schema.ts` |
| DB layer (insert, upsert, slate, read view, prune) | `src/lib/sports/live/store.ts` |
| Ingest worker (standalone process) | `apps/web/scripts/live-odds-worker.mts` |
| Read API (flag gated, cached 5s) | `GET /api/sports/live/[gameId]` (`gameId` is `sports_events.id`) |
| UI | `src/components/sports/live-game.tsx`, rendered under an in-progress pick |
| Disposable-DB integration check | `apps/web/scripts/live-odds-integration.mts` |

## Data rules

- Win probability is the **mid of best bid and best ask** of each outcome's order book, never `last_trade_price`. One-sided, crossed, resolved (0/1) or very wide (> 20 points) books give no number.
- Freshness is the age of the quote, taken as the **older** of the source's book timestamp and our fetch time: under 30s **Live**, 30-120s **Delayed**, over 120s **stale**, which hides the probability and shows "Odds paused". The score and clock keep showing.
- Sources, in order of trust: Polymarket (Gamma list for score/period/clock + one batched CLOB `POST /books`, optional market WebSocket), Kalshi public REST as a cross-check and fallback (freshness is our fetch time, because market `updated_time` is unreliable), ESPN `summary.winprobability` as a last fallback (a model, capped at medium confidence).
- If the primary is stale the next fresh source is shown. If a second source differs by more than 8 points the primary is kept but marked low confidence ("sources differ"). Two order books more than 20 points apart pause the odds. A model (ESPN) can only warn.
- Games are matched on both team names (nickname/full-name aware, never city alone) and a start time within 3 hours; an ambiguous pairing is no match. Kalshi names NBA teams by city, so it uses a loose matcher plus a uniqueness check.

## Upstream load scales with games, not users

The worker polls only games whose `sports_events` row is `scheduled` and inside their live window (5 minutes before the start until 5h NFL / 4h NBA). Per 10s cycle: one Gamma list per live sport, one batched `/books` call for all live tokens, a Kalshi list per sport and ESPN fallbacks at most every 30s. With no live game it sleeps 30s and makes no upstream call. Viewers only read Postgres through the API (5s in-process cache plus `s-maxage=5` at the CDN). Unchanged books are not rewritten except for a 15s heartbeat, so a three hour game is a few hundred rows per key.

Scores come from the Gamma list each cycle. The separate `wss://sports-api.polymarket.com/ws` score stream was verified but is not needed at this cadence; it is a possible later improvement for sub-10s scores.

## Storage (free tier)

`live_quote` retention (`src/lib/sports/live/retention.ts`, run by the worker every 5 minutes): every row for the last 30 minutes, then one row per key per 5 minutes until 3 days, then only the latest row per key, and nothing for games older than 30 days. A key is (event, market, selection, source). `live_state` is one row per game, overwritten. Both tables cascade-delete with the event and are not referenced by picks, lines, markets, ledger or settlement.

## Running the worker

```
cd apps/web
DATABASE_URL=postgres://... node --experimental-strip-types scripts/live-odds-worker.mts [--ws] [--once]
```

Needs Node 22+ (type stripping, global `fetch`/`WebSocket`) and only `DATABASE_URL`. Run **one** replica; a second would only duplicate rows. `SIGTERM` finishes the cycle and exits. `LIVE_ODDS_ENABLED=0` idles it. It logs a one-line summary every minute.

It must be a persistent process, not a Vercel function. Any of these works:

- **Fly.io**: a small app (shared-cpu-1x, 256 MB) with `[processes] worker = "node --experimental-strip-types apps/web/scripts/live-odds-worker.mts --ws"`, `auto_stop_machines = false`, one machine, secret `DATABASE_URL`. Build from the repo root with a Node 22 image and `npm ci --workspaces`.
- **Railway**: a service from the same repo, root directory the repo root, start command as above, variable `DATABASE_URL`.
- **VPS**: a systemd unit with `Restart=always`, `Environment=DATABASE_URL=...`, `ExecStart=/usr/bin/node --experimental-strip-types scripts/live-odds-worker.mts --ws`, `WorkingDirectory=.../apps/web`.

Use the app's normal pooled `DATABASE_URL` (the worker opens at most 2 connections and uses `prepare: false`, so a transaction-mode pooler is fine). The worker has no inbound port. Enable the UI by building the web app with the existing sports flag on; the live strip only appears under an open pick whose game has started.

## Verified and unverified

Verified with real endpoints: Gamma list shape and moneyline parsing, `POST /books` batching (bids arrive unsorted, so top of book is a max/min), the market WebSocket subscribe/PING/book flow, and one live NHL game for socket and REST behavior. Not verified: any live NFL or NBA game (no game was on), the orientation of Polymarket's `score` string (assumed to follow the title/outcome order), `price_change` message field names beyond `best_bid`/`best_ask`, the Kalshi event title format for every team, and tennis (no Polymarket game series is configured, so tennis shows score-less "Odds paused" until a source is added).
