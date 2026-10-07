# Peerfolio

Social investing built around one rule: **percentages are public, dollars never
are.**

Blossom, AfterHour and Robinhood Social are public feeds with follower counts
and dollar amounts. Peerfolio is five surfaces on one engine:

- **Portfolio** — your own net worth, accounts and positions in one place, with
  a time-weighted return that ignores deposits and withdrawals. Only you see it.
- **Leagues** — small private groups of actual friends, ranked on return.
- **Fantasy** — play-money leagues where everyone starts with the same cash,
  picks stocks and races. Nothing here touches a real balance.
- **The Board** — a public leaderboard of top investors, where every return is
  pulled from a connected brokerage rather than typed in.
- **News** — a daily and weekly market recap, index moves, Fear & Greed and the
  week's earnings, so there's something to read before the next move.

Returns are **time-weighted**, so deposits don't count as performance. Whoever
adds the most cash doesn't win; that's what makes a ranking worth reading.

## Screenshots

All screenshots use invented demo data, not real accounts.

### Portfolio

Net worth, accounts and positions in one view. The return leaves deposits out.

![Portfolio page showing net worth, a one-month chart and linked accounts](docs/screenshots/portfolio.png)

Below it, every holding across every account rolled up into one list, with
allocation, today's movers and the leagues you're in.

![Aggregated holdings table with weights, daily change and total return](docs/screenshots/portfolio-holdings.png)

### News

![The daily brief with live-style market cards](docs/screenshots/news.png)

The recap, Fear & Greed, the week's earnings and sector moves.

![Daily recap, Fear & Greed gauge, upcoming earnings and sectors at a glance](docs/screenshots/news-details.png)

### The Board

Public, verified-only, percentages only.

![The Board ranking top traders by return](docs/screenshots/board.png)

### Fantasy

Play-money leagues with a shared starting balance, an optional cap per pick and
an end date. Orders placed while the market is closed wait for the open.

![A fantasy league with the race chart and the trade panel](docs/screenshots/fantasy.png)

### Leagues

A private group ranked on percentage return. Everyone is indexed to 100, so the
chart compares rates of return, not who has more money.

![A league's race chart and standings](docs/screenshots/leagues.png)

## What's shared, and what isn't

| Shared | Never shared |
|---|---|
| Percentage return, time-weighted | Account balances or net worth |
| Top tickers as a share of your own portfolio (opt-in) | Position sizes in dollars |
| Handle, avatar, bio | Email address |

Public profiles are opt-in and off by default.

## Quickstart

No hosted database, OAuth app or Plaid keys needed to see the app running:

```sh
docker compose up -d                            # Postgres on :5433
npm install
cp apps/web/.env.example apps/web/.env.local    # generate the two secrets it names
npm run db:migrate --workspace=@repo/web
npm run db:seed --workspace=@repo/web           # five demo portfolios, 120 days each
npm run dev
```

Then open **http://localhost:3000/dev-login** and sign in as any seeded user.

Two pages can also be looked at without signing in, on invented data:
**/preview/portfolio** and **/preview/news**. Both 404 in production builds.

Port 3000 taken? `PORT=3200 npm run dev --workspace=@repo/web`. Set
`NEXTAUTH_URL` to the same port in `.env.local` — if it disagrees, sign-in
hangs instead of failing loudly.

The developer login exists behind two independent locks — a non-production
build *and* `ENABLE_DEV_LOGIN=true` — because a provider that accepts an email
with no password is a full account takeover if it ever ships. In a production
build the route 404s and the provider isn't registered at all.

For the real thing you need a Postgres URL (Neon and Supabase both work),
Google OAuth credentials and Plaid sandbox keys. `apps/web/.env.example`
documents every variable, including how to generate `ENCRYPTION_KEY` and
`CRON_SECRET`.

### Daily snapshots

`/api/cron/snapshot` is what makes performance history exist at all. Plaid
exposes no historical portfolio value, so the series only grows forward from
the day someone connects and can never be backfilled. Miss a day and that day
is gone for everyone.

The daily snapshot is scheduled in `apps/web/vercel.json` at 22:30 UTC.
Confirm that your Vercel plan enables that job and inspect its run history. If
you use an external scheduler instead, avoid also scheduling a duplicate job:

- **Vercel dashboard** — Settings → Cron Jobs, path `/api/cron/snapshot`.
- **Any external scheduler** (cron-job.org, GitHub Actions, your own box):

  ```sh
  curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/snapshot
  ```

The endpoint refuses without a matching `CRON_SECRET`, so it is safe to expose.

**Prices.** `/api/cron/prices` refreshes live quotes and picks up the official
close. `.github/workflows/prices.yml` calls it every 5 minutes during market
hours and every 10 minutes for a few hours after the close. Add one repository secret
(Settings → Secrets and variables → Actions): `CRON_SECRET`, the same value as
in Vercel. It calls `https://www.peerfolio.org` unless you set a `PEERFOLIO_URL`
repository variable. A run
turns red when it tried to refresh and nothing arrived.

Before writing snapshots it reprices manual positions from the previous
session's closes (`MASSIVE_API_KEY`). That's two market data calls a night, one
for US stocks and ETFs and one for crypto, however many positions exist.

### Plaid webhooks

Point `PLAID_WEBHOOK_URL` at `https://<your-domain>/api/plaid/webhook`.
Requests are signature-verified. Without a reachable webhook, connections that
fall out of auth go stale silently instead of prompting a reconnect.

### Plaid sync regression tests and rollout

Before deploying the hardened sync, apply all committed migrations, including `0014_plaid_investment_flows`
with `npm run db:migrate --workspace=@repo/web`. It adds a transaction ledger so
manual refreshes and webhook retries cannot repeatedly count the same cash flow.
This beta accepts USD accounts and holdings only; other currencies fail closed
and preserve the last successful portfolio until currency conversion is supported.
Short holdings are also rejected explicitly; signed investment-account equity
(e.g. a negative margin balance) remains supported.
New accounts treat their connection day as a baseline; performance begins the
following UTC day. Initial-day balance changes are treated as capital, and late
transactions dated on/before that baseline are excluded from later returns.
The first successful import establishes a baseline; it does not reconstruct or
repair old performance history. Late/corrected flows are accounted for when
observed, so daily returns remain an approximation when institutions report late.

Holdings are replaced atomically within the returned institution accounts, even
when the new holdings list is empty. Removed accounts become inactive. Failed
imports roll back financial changes and preserve the last successful sync time.
Temporary/not-ready errors get two retries, then can recover through a later
refresh, webhook (including `HISTORICAL_UPDATE`), or nightly job.

Reconnect uses the existing Item, including across OAuth redirects. As a
conservative beta policy, new Link connections to an already connected
institution are rejected and the new Item is removed at Plaid. Multiple accounts
inside one connection are supported; separate logins at the same institution
require a future account-level duplicate check. Different institutions work normally.

Run the regular regression suite with `npm run test --workspace=@repo/web`.
For the database-backed test, start this disposable Postgres instance (no volumes):

```sh
docker run --rm -d --name peerfolio-plaid-test -e POSTGRES_PASSWORD=plaid-test -e POSTGRES_DB=plaid_test -p 127.0.0.1:55433:5432 postgres:16-alpine
PLAID_TEST_DATABASE_URL=postgresql://postgres:plaid-test@127.0.0.1:55433/plaid_test npm run test:plaid-sync --workspace=@repo/web
docker stop peerfolio-plaid-test
```

The database harness mocks Plaid API responses; it verifies persistence and
concurrent imports without contacting a financial institution. A real Sandbox
Link/OAuth/webhook walkthrough is still required with Sandbox credentials and
`ENABLE_PLAID_SANDBOX=true`. Leave `PLAID_ENV=sandbox` until Production credentials
and Investments access are actually available. Review bank-specific cash-flow
classification and delayed transactions in a restricted real-data beta before
relying on returns for public rankings.

### Production release gate

Review the branch before merging. First apply all committed migrations to an
isolated Neon branch and run the database regressions above on their disposable
local database. Confirm the preview build and Sandbox Link/OAuth flow. Then
back up production, apply the migrations with the production `DATABASE_URL`,
and deploy the reviewed code. Run migrations before deploying: old code tolerates
the added columns/table, while new code requires them. Do not use `db:push` as a
production migration substitute. A code rollback can leave the additive migrations in
place; dropping either ledger loses accounting or quota history and is not a safe rollback.

Set these variables in the deployment's Production environment without putting
secret values in chat or logs: `PLAID_ENV=production`, `PLAID_CLIENT_ID`,
`PLAID_SECRET` (the production secret), `ENCRYPTION_KEY`, `PLAID_REDIRECT_URI`,
and `PLAID_WEBHOOK_URL`. Keep the encryption key stable across deployments.
The redirect must be registered in Plaid's dashboard, and the webhook must be a
reachable HTTPS `/api/plaid/webhook` endpoint. Authentication, `DATABASE_URL`,
`CRON_SECRET`, and the daily snapshot scheduler must also be configured.
`NEXT_PUBLIC_PLAID_LINKING` is generated by `next.config.ts` at build time from
`PLAID_ENV`; do not set it separately. Redeploy after changing environment values.
Only enable production once Investments access and production keys exist.

### Restricted brokerage beta

Brokerage linking starts disabled for every user, including admins. Set
`ADMIN_EMAILS` to a comma-separated allowlist of actual Peerfolio sign-in emails,
then open `/admin/brokerages` to enable selected users. Authorization is checked
against the database on the server; hiding a button is not the access control.
Turning access off prevents new connections while existing connections can still
refresh, reconnect in update mode, and disconnect.

`PLAID_PRODUCTION_ITEM_LIMIT` defaults to 10. Before enabling real connections,
set `PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED` to Production Items already created
before this tracker or outside this app. The durable budget reserves capacity
before exchanging a public token, and conservatively retains uncertain attempts.
Disconnects, cleanup, and user deletion do not restore capacity. Sandbox does
not consume the Production budget. The admin page shows this app's accounting;
it cannot automatically reconcile total team usage in Plaid's dashboard.

Plaid's Trial plan allows 10 lifetime Production Items, and removal does not free
a slot ([Plaid billing documentation](https://plaid.com/docs/account/billing/)).
An Item is a connection and can include several brokerage accounts. Paid plans
have different limits and billing; verify your actual plan before increasing the
app's cap. Off-by-default access and the cap also limit paid beta exposure.

For the first real-account beta, compare balances, quantities, cost basis, and
cash positions with the brokerage. Refresh twice and confirm no duplicate
positions/flows. Test reconnect and OAuth, disconnect and verify portfolio
removal, then reconnect. Inspect sanitized Link/runtime errors and webhook
activity. Deposits, withdrawals, transfers, and late transaction reporting need
real-institution review before enabling public rankings. A mocked database test
cannot verify actual Plaid permissions, institution coverage, OAuth configuration,
webhook delivery, or institution-specific transaction classifications.

## Verified vs. manual accounts

Accounts carry a **source**. Plaid-connected accounts are `plaid`; typed-in
ones are `manual`.

Manual accounts exist so people can start building history before their
brokerage is connectable — waiting costs history permanently. Manual
portfolios play in private leagues. **Only Plaid-verified portfolios can rank
on the public board**, so nothing self-reported is ever presented as verified.
That makes verification the reason to connect, rather than a prerequisite to
launching.

## Architecture

```
apps/web/src
├── app/(app)/        Signed-in surfaces: dashboard (Portfolio), leagues, fantasy,
│                     board, news, settings
├── app/preview/      Sign-in-free Portfolio and News pages on sample data
├── app/u/[handle]/   Public trader profiles
├── app/api/          Route handlers (every Plaid route is session-guarded)
│                     plus the cron jobs for snapshots, prices and news
├── components/       UI primitives, hand-rolled SVG charts, feature components
├── db/               Drizzle schema and client (server-only)
└── lib/              Plaid client + sync, returns math, crypto, formatting
```

**Security notes.** Plaid access tokens are encrypted with AES-256-GCM and
never leave the server — no route returns one, and nothing is kept in
`localStorage`. `src/db/index.ts` imports `server-only`, so a client component
that reaches for the database fails the build rather than shipping the driver
to the browser.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Build all workspaces |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run check-types` | `tsc --noEmit` |
| `npm test` | Unit tests (`node:test`, no framework) |
| `npm run db:generate --workspace=@repo/web` | Write a migration from schema changes |
| `npm run db:migrate --workspace=@repo/web` | Apply migrations |
| `npm run db:studio --workspace=@repo/web` | Drizzle Studio |

## Charts

Charts are hand-rolled SVG rather than a charting library — that's what let the
dashboard bundle drop from 303 kB to 128 kB of first-load JS.

The palette is validated for colour-vision deficiency, and the slot **ordering**
in `globals.css` is the accessibility mechanism, not decoration. Re-run the
validator before reshuffling it. Gain and loss always ship an arrow and a sign
alongside the colour, because that red/green pair sits in the CVD warn band and
colour alone wouldn't be readable for everyone.
