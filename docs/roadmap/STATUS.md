# Status: fantasy seasons, drafts, recaps, notes

Branch: `feat/league-seasons`. No PR opened.

## Done (built and checked)
- Weekly rounds and seasons (trading mode), season standings (points, then compounded return, wins, best round), head to head, trophies, season archive, rematch / next season, wrap-up. Existing leagues get an open-ended trading season lazily on first load.
- Weekly stock draft mode (N picks, private until the lock, server-side lock against the database clock, equal weight, exact-tie break on worst pick).
- Weekly recap (in-app card, public percentage-only page and 1200x630 image at /recap/[token] and /recap/[token]/image) and notification-ready rows in fantasy_events.
- "Why I picked this" notes on trades and draft picks, with replies and emoji reactions (same six emoji as standings).
- Quick wins: lint green, rank and round status on the league list, better empty state, create-form format row, join page copy.

## Verified
- Unit tests: 53 new (`fantasy-season.test.ts`, `season-format.test.ts`); full suite 998 pass; `tsc`, `eslint --max-warnings 0` and `next build` pass.
- Run locally against Postgres 16 with seeded leagues (legacy league, trading season with 3 settled rounds, draft season with settled rounds and a tie-break), logged in as a seeded user: season page, league page strip, list, recap image and public page, picks save, lock refusal after the deadline. Screenshots reviewed in light at 1280px and dark at 390px.

## Not verified
- Dark mode at desktop width and light mode at mobile width were not captured (same CSS tokens).
- Real market data: local runs used seeded prices. Draft marks use stored final closes; behaviour across a real Friday close is untested.
- Cron backstop (`advanceAllLeagues` in `/api/cron/snapshot`) was not run; the same code path runs on page load.
- Concurrency (two requests settling one round) is guarded by an advisory lock and claim updates but was not load tested.
- Posting a trade with a note, and replying/reacting on a note, were checked only through typecheck and the loaders, not clicked through.

## Known limits and risks
- Migration `0025_fantasy_seasons` is additive (new tables only). Another branch adding a migration 0025 will collide in `drizzle/meta/_journal.json`; renumber on merge.
- `fantasy.ts` touch points are small: `FeedItem.userId`, `previewFantasyLeague` returns `playsAs`. `fantasy/page.tsx`, `trade-feed.tsx`, `trade-panel.tsx`, `[id]/page.tsx` and four API routes have small additive edits.
- Rounds are UTC weeks, so the draft locks Sunday evening US time. A round missing its Sunday snapshot settles after 2 days on the latest data and is flagged "late".
- Trading-mode "best/worst decision" compares a trade price with the latest close at settlement.

## Next steps
1. Delivery worker for `fantasy_events` (push/email) once a provider exists.
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
Create a fantasy league with "Weekly draft", open `/fantasy/<id>/season`, pick stocks. To see settlement, move a round's `starts_at`/`ends_at` into the past in `fantasy_rounds` and reload the season page.
