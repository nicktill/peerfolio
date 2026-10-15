# Peerfolio Intelligence

Branch `feat/peerfolio-intelligence`. All changes are additive. Test status: see [testing.md](testing.md).

## What was built

| Feature | Where | Needs |
|---|---|---|
| Floating AI assistant (glass window, orb, streaming answers) | `apps/web/src/components/assistant/*`, `POST /api/assistant` | `NEXT_PUBLIC_ASSISTANT_ENABLED=1`, `OPENAI_API_KEY`, migration 0022 |
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
| `NEXT_PUBLIC_ASSISTANT_ENABLED` | unset (off) | `"1"` mounts the assistant in `app-shell.tsx`. Build-time (`NEXT_PUBLIC_`): needs a rebuild/redeploy to change. |
| `OPENAI_API_KEY` | unset | Shared with news and import. Without it `/api/assistant` returns 503. |
| `ASSISTANT_AI_MODEL` | `gpt-5-mini` | Model id. |
| `ASSISTANT_MONTHLY_BUDGET_USD` | 10 | All users, calendar month (UTC). |
| `ASSISTANT_PER_DAY_USD` | 0.25 | One user, rolling 24 h. |
| `ASSISTANT_PER_HOUR` | 40 | Requests per user, rolling hour. |

Not in `.env.example` but read by `limits.ts`: `ASSISTANT_AI_INPUT_PER_M` (0.25) and `ASSISTANT_AI_OUTPUT_PER_M` (2), the per-million-token prices used for cost accounting. Update them if the model changes.

Migrations in `apps/web/drizzle/`: `0022_ai_usage.sql` (table + indexes), `0023_benchmark_prices.sql` (table), `0024_security_sectors.sql` (three nullable columns on `securities`).

## Rollout checklist

1. Run migrations 0022-0024 (all create-table / add-nullable-column; no rewrites of existing data).
2. Set `FINNHUB_API_KEY` (sectors) and `MASSIVE_API_KEY` (benchmark history) if not already set.
3. Deploy with the flag **off**. Check `/wealth`, the benchmark chips and the replay control on the portfolio page.
4. Set `OPENAI_API_KEY`, a low `ASSISTANT_MONTHLY_BUDGET_USD`, then set the flag to `1` and redeploy.
5. Watch `ai_usage` and provider stats for the first days. The items listed as unverified in [risks.md](risks.md) have never been run against real providers; do this on staging first.

## Rollback

- **Assistant:** unset `NEXT_PUBLIC_ASSISTANT_ENABLED` and redeploy. The UI disappears. The route itself is not flag-gated server-side: it still answers a signed-in caller who posts to it as long as `OPENAI_API_KEY` is set. Unset the key (503) to close it fully.
- **Benchmarks / Replay / Wealth Lab / sectors:** no flags. Revert the code to remove them. Replay and Wealth Lab store nothing server-side (Wealth Lab uses browser `localStorage`).
- **Schema:** nothing reads the new tables/columns outside the new code, so leaving 0022-0024 applied after a revert is harmless. No down-migrations were written.
