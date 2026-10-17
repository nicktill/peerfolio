# Testing sports picks locally

Everything runs offline with the mock provider. No API keys needed.

## 1. One-time setup

From the repo root:

```bash
docker compose up -d                      # Postgres on localhost:5433
cd apps/web
cp .env.example .env.local                # then fill ENCRYPTION_KEY (openssl rand -hex 32) and NEXTAUTH_SECRET (openssl rand -base64 32)
```

Add these lines to `apps/web/.env.local`:

```
NEXT_PUBLIC_SPORTS_ENABLED="1"   # turns the Sports side on (flag: sportsEnabled)
SPORTS_MOCK="1"                  # offline mock odds + results
CRON_SECRET="localcron"          # only needed to call the cron/admin routes by hand
ENABLE_DEV_LOGIN="true"          # already the default in .env.example
```

## 2. Database, seed, run

```bash
npm install                       # from the repo root, once
cd apps/web
npm run db:migrate                # applies 0025_sports_picks.sql (additive: new tables only)
npm run db:seed                   # demo users (note: truncates existing local data)
npm run sports:seed               # publishes mock NFL/NBA/tennis lines, creates "Demo Sharps" with a few picks, prints the invite code
npm run dev                       # http://localhost:3000
```

Sign in with the dev login as `maya@example.com` (or any `*@example.com` demo user), open
**Fantasy**, and switch **Stocks | Sports**. Open "Demo Sharps": tap a line, enter a stake, lock it in.

Without `NEXT_PUBLIC_SPORTS_ENABLED=1` the switch does not render and every `/api/sports/*` route
returns 404, which is how production behaves until you decide to enable it.

## 3. Try the whole loop

```bash
npm run sports:settle-demo        # pretends every game ended (27-20 NFL, 118-109 NBA, 2-1 tennis) and settles all open picks
npm run sports:settle-demo        # run it again: "settled: 0", nothing is paid twice
```

Refresh the league page: picks turn Won/Lost, credits and standings move. Check the invariant:

```bash
psql postgresql://peerfolio:peerfolio@localhost:5433/peerfolio -c \
 "select m.credits, (select sum(amount) from sports_ledger l where l.member_id = m.id) as ledger from sports_members m"
```

The two columns must match for every row.

To publish fresh lines again after a settle run, clear the sports tables (they are all new, nothing else is touched):

```bash
psql postgresql://peerfolio:peerfolio@localhost:5433/peerfolio -c \
 "truncate sports_ledger, sports_picks, sports_lines, sports_markets, sports_events, sports_members, sports_leagues cascade"
npm run sports:seed
```

## 4. Cron and admin routes by hand

```bash
curl -H "authorization: Bearer localcron" localhost:3000/api/cron/sports/publish   # fetch, publish new fixed lines, lock due markets
curl -H "authorization: Bearer localcron" localhost:3000/api/cron/sports/settle    # lock due markets, settle finished games
curl -X POST -H "authorization: Bearer localcron" -H 'content-type: application/json' \
  -d '{"marketId":"<uuid>","reason":"QB ruled out"}' localhost:3000/api/sports/admin/void   # void + refund one market
```

## 5. Automated checks

```bash
cd apps/web
npm test            # node:test, includes src/lib/sports/*.test.ts (odds, lines, picks, locking, settlement, idempotency, composite providers)
npm run check-types
npm run lint
```

## 6. Trying the real provider

Set `THE_ODDS_API_KEY` (free key from the-odds-api.com), remove `SPORTS_MOCK`, and call the publish
route. Usage is recorded in `sports_provider_usage`. Set `SPORTS_PROPS_ENABLED=1` to include
player props (costs more credits). The adapter is unverified against the live API, see STATUS.md.

Concurrency stress (needs the local database and demo users): `npm run sports:stress` races picks against voids and settlement for 15 rounds and fails on any deadlock, ledger mismatch or pick left open on a void market.
