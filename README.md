# Peerfolio

Social investing built around one rule: **percentages are public, dollars never are.**

Blossom, AfterHour and Robinhood Social are public feeds with follower counts and
dollar amounts. Peerfolio is two surfaces on one engine:

- **Leagues** — small private groups of actual friends, ranked on return.
- **The Board** — a public leaderboard of top investors, where every return is
  pulled from a connected brokerage rather than typed in.

Returns are **time-weighted**, so deposits don't count as performance. Whoever
adds the most cash doesn't win; that's what makes a ranking worth reading.

## What's shared, and what isn't

| Shared | Never shared |
|---|---|
| Percentage return, time-weighted | Account balances or net worth |
| Top tickers as a share of your own portfolio (opt-in) | Position sizes in dollars |
| Handle, avatar, bio | Email address |

Public profiles are opt-in and off by default.

## Verified vs. manual

Accounts carry a **source**. Plaid-connected accounts are `plaid`; typed-in ones
are `manual`.

Manual accounts exist so people can start building history before their
brokerage is connectable — snapshot history only grows forward and can't be
backfilled, so the cost of waiting is permanent. Manual portfolios play in
private leagues. **Only Plaid-verified portfolios can rank on the public board**,
so nothing self-reported is ever presented as verified.

## Setup

```sh
npm install
cp apps/web/.env.example apps/web/.env.local   # then fill it in
npm run db:generate --workspace=@repo/web       # only after schema changes
npm run db:migrate  --workspace=@repo/web
npm run dev
```

You need a Postgres database (Neon or Supabase both work), Google OAuth
credentials, and Plaid sandbox keys. `apps/web/.env.example` documents every
variable, including how to generate `ENCRYPTION_KEY` and `CRON_SECRET`.

### Daily snapshots

`/api/cron/snapshot` is the job that makes performance history exist. It's wired
in `apps/web/vercel.json` to run on weekday evenings and is guarded by
`CRON_SECRET`. Without it, nobody accumulates a track record.

### Plaid webhooks

Point `PLAID_WEBHOOK_URL` at `https://<your-domain>/api/plaid/webhook`. Requests
are signature-verified. Without a reachable webhook, connections that fall out of
auth go stale silently instead of prompting a reconnect.

## Architecture

```
apps/web/src
├── app/(app)/        Signed-in surfaces: dashboard, leagues, board, settings
├── app/u/[handle]/   Public trader profiles
├── app/api/          Route handlers (all Plaid routes are session-guarded)
├── components/       UI primitives, hand-rolled SVG charts, feature components
├── db/               Drizzle schema and client (server-only)
└── lib/              Plaid client + sync, returns math, crypto, formatting
```

**Security notes.** Plaid access tokens are encrypted with AES-256-GCM and never
leave the server — no route returns one, and nothing is kept in `localStorage`.
`src/db/index.ts` imports `server-only` so a client component that reaches for
the database fails the build rather than shipping the driver to the browser.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Build all workspaces |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run check-types` | `tsc --noEmit` |
| `npm run db:generate --workspace=@repo/web` | Write a migration from schema changes |
| `npm run db:migrate --workspace=@repo/web` | Apply migrations |
| `npm run db:studio --workspace=@repo/web` | Drizzle Studio |

## Charts

Charts are hand-rolled SVG rather than a charting library — it's what let the
dashboard bundle drop from 303 kB to 128 kB of first-load JS.

The palette is validated for colour-vision deficiency; the slot **ordering** in
`globals.css` is the accessibility mechanism, not decoration. Re-run the
validator before reshuffling it. Gain/loss always ships an arrow and a sign
alongside the colour, because that red/green pair sits in the CVD warn band and
colour alone would not be readable for everyone.
