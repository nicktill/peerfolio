# Status: fantasy seasons, drafts, recaps, notes

Branch: `feat/league-seasons`. No PR opened. Migration is `0025_fantasy_seasons` (planned order: seasons 0025, sports 0026, ios 0027).

## Done
- Weekly rounds and seasons (trading mode): season table (points, then compounded return, wins, best round), head to head, trophies, archive, rematch, owner wrap-up (confirmed, and members are notified through `fantasy_events`).
- Weekly draft: N picks, private until the lock, locked on the database clock inside the save transaction, one save at a time per player, unique slot per pick. Entry is the last final close before the lock, exit the round's last close; a round waits for its final-day exits and settles after a 2-day grace, flagged late. Draft picks are now included in the stale-price refresh (`staleHeldSecurities`, `unsettledHeldSql`, live quote claims) while their round is unsettled.
- Draft leagues have no trading UI: the league page sends them to the season page, and the list shows season points instead of portfolio return.
- Recaps: in-app card, public percentage-only page and image. Public pages show no tickers, resolve names live ("A former member"), cache for 5 minutes, and the owner can stop sharing (the token is replaced; sharing again issues a new one).
- Notes on trades and picks with replies, reactions, edit and remove (clearing removes); one 280 character limit everywhere.
- Opt-in for existing leagues: a league without a season looks and works exactly as before (no strip, no "Add why", no round chips). Its owner sees a "Weekly rounds" button that turns it on. New leagues get a season at creation.
- Late joiners are not ranked for a round they joined after it began. An all-tied round awards no trophy; hat trick needs a field of three.
- Reading never writes: the list and league endpoints create nothing, chips are three batched queries, cron only visits leagues with an active season, and an open-ended season creates only missing rounds and settles at most 60 per call.
- `draft_closing` reminder events one day before a lock.

## Verified
- Tests: 1001 pass (new: round, tie-break, points, deadline, trophy and recap logic; stale-price SQL including a draft-pick case run against Postgres). `tsc`, `eslint --max-warnings 0` pass; `next build` passes.
- Run locally against Postgres 16 with seeded leagues: a legacy league (visually unchanged except the owner-only "Weekly rounds" button), a trading season with settled rounds, draft seasons with a tie-break, a 106-round open-ended season (all rounds created once, settled 60 then 45 across two loads), draft lock refusal after the deadline, wrap-up leaving no open draft round. Screenshots reviewed: light and dark desktop, light and dark phone.

## Not verified
- Real market prices over a real Friday close; local runs used seeded prices.
- The cron backstop was not executed (same code path as page load).
- Trade notes, replies, reactions and the stop-sharing button were not clicked through end to end.
- Concurrent settlement is guarded by an advisory lock and claim updates, not load tested.

## Risks
- Rounds are UTC weeks, so a draft locks Monday 00:00 UTC (Sunday evening in the US); the app shows the lock in the viewer's local time.
- A Friday market holiday leaves exit marks a day short, so that round settles after the 2-day grace and is flagged late.
- `fantasy.ts` has two small additive touches (`FeedItem.userId`, list rank hidden when everyone is level, `playsAs` on the join preview).

## Next steps
1. Delivery worker for `fantasy_events`.
2. Bound the snapshot query in `loadFantasyLeague`; cache the league list.
3. Benchmark challenge round, exclusive snake draft, seasons for real-portfolio Leagues.

## Run it locally
```
docker compose up -d            # Postgres on 5433 (or any Postgres; set DATABASE_URL)
cd apps/web && cp .env.example .env.local   # set NEXTAUTH_SECRET, ENCRYPTION_KEY, ENABLE_DEV_LOGIN=true
npx drizzle-kit migrate && npm run db:seed
npm run dev                     # sign in at /dev-login as maya@example.com
npm test && npm run check-types && npm run lint
```
Create a league with "Weekly draft" and open `/fantasy/<id>/season`. To see settlement, move a round's `starts_at`/`ends_at` into the past in `fantasy_rounds` and reload the season page.
