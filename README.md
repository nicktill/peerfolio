# Peerfolio

Track your portfolio across every brokerage, with returns that mean something.

Returns are **time-weighted**, so deposits don't count as performance. Adding
cash doesn't make you look like a better investor — which matters a great deal
once portfolios start getting compared to each other.

## Setup

```sh
npm install
cp apps/web/.env.example apps/web/.env.local   # then fill it in
npm run db:migrate --workspace=@repo/web
npm run dev
```

You need a Postgres database (Neon and Supabase both work), Google OAuth
credentials, and Plaid sandbox keys. `apps/web/.env.example` documents every
variable, including how to generate `ENCRYPTION_KEY` and `CRON_SECRET`.

### Daily snapshots

`/api/cron/snapshot` is what makes performance history exist at all. Plaid
exposes no historical portfolio value, so the series only grows forward from
the day someone connects and can never be backfilled. It's wired in
`apps/web/vercel.json` to run on weekday evenings, guarded by `CRON_SECRET`.

### Plaid webhooks

Point `PLAID_WEBHOOK_URL` at `https://<your-domain>/api/plaid/webhook`.
Requests are signature-verified. Without a reachable webhook, connections that
fall out of auth go stale silently instead of prompting a reconnect.

## Verified vs. manual accounts

Accounts carry a **source**. Plaid-connected accounts are `plaid`; typed-in
ones are `manual`.

Manual accounts exist so people can start building history before their
brokerage is connectable — waiting costs history permanently. They're marked
as self-reported everywhere they appear.

## Architecture

```
apps/web/src
├── app/(app)/        Signed-in surfaces
├── app/api/          Route handlers (every Plaid route is session-guarded)
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
