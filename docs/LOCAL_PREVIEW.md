# Local preview: seasons, draft, recaps, sports and the assistant

Branch `preview/all-features` merges three feature branches on top of `main` so you can click through all of
them together on your own machine:

- `feat/assistant-polish` (assistant UI and answers)
- `feat/league-seasons` (weekly rounds, weekly draft, recaps, notes)
- `feat/sports-picks` (Fantasy Stocks | Sports switch, sports leagues)

It does not include `feat/ios-app`. Nothing here talks to a paid service: prices are seeded, sports use the
offline mock provider, and the assistant has a canned demo page. Everything below is for macOS or Linux.

## What you need

- Node 22 or newer (the seed scripts use `--experimental-strip-types`). Check with `node -v`.
- npm 10 (ships with Node 22).
- Docker with Compose v2 (`docker compose version`), for Postgres 16.
- Free ports 3000 (the app) and 5433 (Postgres).

## Setup (copy and paste)

```bash
git clone https://github.com/nicktill/peerfolio.git
cd peerfolio
git checkout preview/all-features
npm ci

docker compose up -d                       # Postgres 16 on localhost:5433, waits until healthy below
docker compose ps                          # STATUS should say "healthy" (a few seconds)

cp apps/web/.env.preview.example apps/web/.env.local
cd apps/web
npm run db:migrate                         # applies all 29 migrations (0000 to 0028)
npm run preview:seed                       # demo data, about 30 seconds
npm run dev                                # http://localhost:3000
```

`.env.preview.example` is already filled in for local use: the sports flag is on
(`NEXT_PUBLIC_SPORTS_ENABLED=1`), the mock provider is on (`SPORTS_MOCK=1`), the dev login is on
(`ENABLE_DEV_LOGIN=true`), and the two secrets are throwaway values. Do not reuse that file anywhere deployed.

`npm run preview:seed` is safe to run again at any time. It wipes the demo data and rebuilds it, and it also
refreshes timestamps (see Troubleshooting). Lines of "NOTICE: truncate cascades" in its output are normal.

## Sign in

Open http://localhost:3000/dev-login and type `maya@example.com`. Maya owns every league, so she sees the owner
controls. Other demo users you can switch to (sign out first): `theo@`, `deshawn@`, `priya@`, `sam@` (all
`@example.com`). Sam has not picked for the open draft round, so signing in as Sam shows an empty picker.

## What the seed creates

| What | Details |
| --- | --- |
| People | 5 demo users (Theo, Maya, DeShawn, Priya, Sam) with portfolios, a "Group Chat" league, and a web of follows |
| **Legacy Stock Race** | An ordinary Fantasy stock league with no season at all (invite `LGCY2345`). It must look and work as it did before seasons existed, apart from an owner-only "Weekly rounds" button |
| **Friday Fund** | Weekly trading rounds (invite `WKLY2345`): 4 settled rounds, round 5 running, trades, "why" notes with replies and reactions, trophies, a season table |
| **Sunday Draft Club** | Weekly draft, 5 picks per round (invite `DRFT2345`): rounds 1 to 3 settled (round 2 is decided by the tie-break: Priya and Sam both average +4.00%, Priya wins on her worst pick), round 4 locked and running, round 5 open for picks with Maya holding 3 of 5 saved |
| Recap links | One public, percentage-only recap per settled round (the seed prints the `/recap/<token>` links) |
| **Demo Sharps** | A Sports league with published mock lines for NFL, NBA and tennis, a settled round (some picks won, some lost, credits and standings moved), and 5 open picks on a later batch of lines |

Scoring, results, trophies and recaps all come from the real season engine, not from hand-written rows.
Prices are a seeded random walk written as the latest closing prices, so no market-data key is needed.

## Guided tour

1. **Fantasy Stocks | Sports switch**: sidebar, Fantasy (http://localhost:3000/fantasy). The Stocks | Sports
   toggle is at the top. Stocks lists three leagues: Legacy Stock Race (shows a normal return), Friday Fund and
   Sunday Draft Club (show round chips and, for the draft, season points).
2. **Legacy league is untouched**: open Legacy Stock Race. No season strip, no "Add why", no round chips.
   As Maya you will see one extra "Weekly rounds" button, which would opt the league into seasons (do not click
   it if you want to keep the demo as is).
3. **Seasons**: open Friday Fund, then its season page (`/fantasy/<id>/season`, reached from the season strip).
   Look for the season table, head to head, trophies, the rounds list and the round recap card.
4. **Draft picker**: open Sunday Draft Club. The season page opens with the "Round 5 draft" card: Maya has 3 of
   5 picks saved, with a note. Add two more by typing a symbol from the seeded list (`AAPL MSFT NVDA GOOGL AMZN
   META TSLA JPM KO DIS`) and press Save. Also look at "Round 4" (locked, scored live), the settled rounds
   with the picks and notes under them, and round 2 for the tie-break.
5. **Recap share page**: on a season page, "Share recap" in the recap card, or open a link the seed printed,
   for example `http://localhost:3000/recap/<token>`. It works signed out (try a private window) and shows
   percentages and ranks only. "Stop sharing" (owner) kills the link.
6. **Sports tab**: Fantasy, then Sports. Open Demo Sharps. Look at open lines (tap one, enter a stake, lock it
   in), your slip, standings and the locked picks list with Won and Lost results.
7. **Assistant (no key needed)**: open http://localhost:3000/preview/assistant-harness, click the glowing
   launcher bottom right, then "Analyze my portfolio". Follow-up chips give more canned answers (a table,
   risks). It is a demo harness: the browser answers, no server or model is called.

### Using the real assistant

Put a key in `apps/web/.env.local` (`OPENAI_API_KEY="sk-..."`), restart `npm run dev`, sign in, and open the
assistant from the sidebar on any page. To exercise the real route from the harness page, add `?live=1`
(you must be signed in in the same browser). The real assistant needs migration 0022, which `db:migrate` applied.

## Stopping and resetting

```bash
# stop the app: Ctrl+C
docker compose down            # stop Postgres, keep the data
docker compose down -v         # stop Postgres and delete all data (full reset, then re-run the setup from "docker compose up")
cd apps/web && npm run preview:seed   # just rebuild the demo data
```

## Troubleshooting

- **Port 5433 or 3000 is in use.** Change the left side of `5433:5432` in `docker-compose.yml` and
  `DATABASE_URL` in `.env.local` together. For the app, `PORT=3200 npm run dev` and set
  `NEXTAUTH_URL="http://localhost:3200"`, or sign-in hangs.
- **`docker compose` not found.** Install Docker Desktop (macOS) or the Compose plugin (Linux). Any local Postgres
  16 works too: create a `peerfolio` database and point `DATABASE_URL` at it.
- **`connection refused` or `DATABASE_URL is not set`.** Postgres is not up yet (`docker compose ps`), or you ran the
  command outside `apps/web`, or `.env.local` is missing. Re-do the `cp` step.
- **`migrate` says a relation already exists.** The database holds an older, differently numbered copy of these
  migrations (for example from running `feat/sports-picks` or `feat/league-seasons` on its own). Reset it with
  `docker compose down -v && docker compose up -d`, then migrate again.
- **`node: bad option: --experimental-strip-types`.** Node is older than 22.6. Use Node 22 (`nvm install 22`).
- **Saving a draft pick says prices are unavailable.** Picks use the stored price when it is under 12 hours old,
  otherwise the app tries a market-data provider, and none is configured. Run `npm run preview:seed` again to
  refresh the prices, and only use the ten seeded symbols.
- **Trading says "Live prices aren't available".** Expected: stock trading needs a live quote provider. The preview
  covers seasons, drafts, recaps and settlement, which do not.
- **Sports lines show as locked.** The mock games kick off a few hours after the seed ran, and a line locks at
  kick-off. Run `npm run preview:seed` again for fresh open lines.
- **The draft round is locked.** Draft picks lock Monday 00:00 UTC (Sunday evening in the US). Run the seed again
  after the lock passes and it builds the new week.
- **No Stocks | Sports switch.** `NEXT_PUBLIC_SPORTS_ENABLED=1` is read at build time of the dev server: restart
  `npm run dev` after editing `.env.local`.
- **`/dev-login` redirects or refuses.** `ENABLE_DEV_LOGIN="true"` must be in `.env.local`, and the app must not run
  as a production build (`npm run dev`, not `npm start`).
- **Harness page 404s.** Production builds 404 it on purpose. Use `npm run dev`.
- **Assistant launcher is missing in the app.** It only shows with `OPENAI_API_KEY` set. Use the harness page instead.

## Checks

```bash
cd apps/web
npm test
npm run check-types
npm run lint
```

Screenshots from a clean run of these exact steps are in `docs/preview-screenshots/`.
