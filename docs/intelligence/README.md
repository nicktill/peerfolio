# Peerfolio Intelligence

Branch `feat/peerfolio-intelligence`. All changes are additive. Test status: see [testing.md](testing.md).

## What was built

| Feature | Where | Needs |
|---|---|---|
| Floating AI assistant (glass window, orb, streaming answers) | `apps/web/src/components/assistant/*`, `POST /api/assistant` | on by default; needs `OPENAI_API_KEY` and migration 0022 (hidden automatically if either is missing) |
| Portfolio X-Ray (allocation, concentration, performance, risk flags, sector exposure) | `lib/ai/portfolio-xray.ts`, `components/assistant/xray-report.tsx` | assistant on |
| Assistant tools: holdings, news, benchmarks, leagues, fantasy | `lib/ai/tools.ts` | assistant on |
| Spend limits | `lib/ai/limits.ts`, `lib/ai/usage.ts`, table `ai_usage` | migration 0022 |
| Benchmark comparison on the portfolio chart (SPY / QQQ / VTI) | `GET /api/portfolio/benchmark`, `lib/benchmarks.ts`, `lib/benchmark-data.ts` | migration 0023, `MASSIVE_API_KEY` for real data |
| Portfolio Replay (value-only) | `lib/replay.ts`, `components/dashboard/replay-control.tsx` | none new |
| Wealth Lab | route `/wealth`, `lib/wealth/engine.ts`, `components/wealth/*` | none new |
| Sector exposure | `lib/ai/sectors.ts`, `refreshSecuritySectors` in `lib/positions.ts` | migration 0024, `FINNHUB_API_KEY` |

## Index

[architecture](architecture.md) · [design audit](design-audit.md) · [dependency map](dependency-map.md) · [risks](risks.md) · [testing](testing.md) · [roadmap](roadmap.md)

## Turning it on

Environment (`apps/web/.env.example`, assistant block):

| Variable | Default | Meaning |
|---|---|---|
| `ASSISTANT_ENABLED` | unset (on) | Runtime kill switch: `"0"` hides the assistant (via `/api/assistant/status`) and makes `/api/assistant` return 503, no redeploy needed. |
| `NEXT_PUBLIC_ASSISTANT_ENABLED` | unset (on) | `"0"` removes the assistant from the build entirely. Build-time. |
| `OPENAI_API_KEY` | unset | Shared with news and import. Without it `/api/assistant` returns 503. |
| `ASSISTANT_AI_MODEL` | `gpt-5-mini` | Model id. |
| `ASSISTANT_MONTHLY_BUDGET_USD` | 10 | All users, calendar month (UTC). |
| `ASSISTANT_PER_DAY_USD` | 0.25 | One user, rolling 24 h. |
| `ASSISTANT_PER_HOUR` | 40 | Requests per user, rolling hour. |

Not in `.env.example` but read by `limits.ts`: `ASSISTANT_AI_INPUT_PER_M` (0.25) and `ASSISTANT_AI_OUTPUT_PER_M` (2), the per-million-token prices used for cost accounting. Update them if the model changes.

Migrations in `apps/web/drizzle/`: `0022_ai_usage.sql` (table + indexes), `0023_benchmark_prices.sql` (table), `0024_security_sectors.sql` (three nullable columns on `securities`).

## Rollout

The assistant is **on by default** and shows itself only when the server confirms it is usable: `OPENAI_API_KEY` set, a positive monthly budget, not switched off, and the `ai_usage` table present (`GET /api/assistant/status`). Production builds apply additive migrations 0022-0024 automatically (`scripts/migrate-on-deploy.mjs`), so merging to `main` is the whole rollout.

1. Merge to `main`; the production build applies migrations 0022-0024 (create-table / add-nullable-column only).
2. `FINNHUB_API_KEY` (sectors) and `MASSIVE_API_KEY` (benchmark history) must be set for those features; without them the sector section and benchmark line report that data isn't available.
3. Watch `ai_usage` and provider stats for the first days. Items listed as unverified in [risks.md](risks.md) have not run against real providers.

## Rollback

- **Assistant:** set `ASSISTANT_ENABLED=0` (takes effect immediately, no redeploy): the launcher disappears and the route returns 503. Setting `ASSISTANT_MONTHLY_BUDGET_USD=0` does the same.
- **Benchmarks / Replay / Wealth Lab / sectors:** no flags. Revert the code to remove them. Replay and Wealth Lab store nothing server-side (Wealth Lab uses browser `localStorage`).
- **Schema:** nothing reads the new tables/columns outside the new code, so leaving 0022-0024 applied after a revert is harmless. No down-migrations were written.
