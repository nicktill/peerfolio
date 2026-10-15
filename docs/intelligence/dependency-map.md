# Dependency map

Paths are under `apps/web/src/`. "Budget" means the provider budgets enforced in `lib/provider-fetch.ts` / `lib/provider-budget.ts` (providers: finnhub, alpaca, massive, tiingo; per-minute + burst, with cooldowns).

| New feature | Reuses (existing) | New code | Provider budgets touched |
|---|---|---|---|
| Portfolio X-Ray | `lib/dashboard-math` (`summarizeHoldings`), `lib/returns` (snapshots, live point, TWR), `lib/known-etfs` (`effectiveSecurityType`), `holdings/securities/accounts` tables | `lib/ai/portfolio-xray.ts`, `risk-metrics.ts`, `portfolio-data.ts`, `sectors.ts` | None directly. Triggers sector refresh (below). Uses stored prices only. |
| Benchmark compare (chart + tool) | `lib/returns` TWR via `trackedWindow`, `lib/market-data` `dailyCloses` | `lib/benchmarks.ts`, `lib/benchmark-data.ts`, table `benchmark_prices`, `/api/portfolio/benchmark` | **massive**, only for missing days, once per symbol per 6 h per instance; none when the viewer leaves benchmarks off. |
| Replay | Same TWR series as the chart; optional benchmark series | `lib/replay.ts`, `replay-control.tsx` | None new (benchmark data as above if a benchmark is selected). |
| Wealth Lab | Nothing server-side | `lib/wealth/engine.ts`, `components/wealth/*`, route `/wealth` | None. |
| Sector exposure | `lib/positions.ts` scheduler pattern, `lib/finnhub.ts` (`fetchCompanyProfile`), `withProviderCaller` | `refreshSecuritySectors`, `scheduleSectorRefresh`, `lib/ai/sectors.ts`, columns on `securities` | **finnhub** `/stock/profile2`: up to 5 securities per run, 60 s per-process throttle, 30-day retry per security; only after someone opens the X-Ray; stops on first non-ok status. |
| Assistant: holdings tool | `loadPositions` (user-scoped query), `summarizeHoldings` | `tools.ts` | None |
| Assistant: news tool | `lib/news` `readCachedNews` (cached only) | `lib/ai/news-match.ts` | None (reads the news job's cache). |
| Assistant: leagues tools | `lib/social.ts`: `listLeaguesForUser`, `requireMembership`, `buildLeagueStandings` | `lib/ai/league-view.ts` (allow-list shaping) | None; whatever `buildLeagueStandings` itself does. |
| Assistant: fantasy tool | `lib/fantasy.ts` `loadFantasyLeague(userId, id, { refresh: false })` | `lib/ai/fantasy-view.ts` | None by design: `refresh:false` skips price requests and order fills. League names come from a plain query. |
| Assistant itself | `lib/auth` `getCurrentUserId`, `OPENAI_API_KEY` | `route.ts`, `limits.ts`, `usage.ts`, table `ai_usage` | **OpenAI** (not part of `provider-budget`; capped by `ai_usage` instead). Shares the key with the news job and import. |

## Notes

- The OpenAI spend of news (`NEWS_AI_MONTHLY_BUDGET_USD`) and the assistant (`ASSISTANT_MONTHLY_BUDGET_USD`) are separate ledgers on one key; the provider's own account limit is the shared ceiling.
- Model selection is per feature (`ASSISTANT_AI_MODEL`, `NEWS_AI_MODEL`, `IMPORT_AI_MODEL`).
- Not verified: whether the `massive` provider budget defaults suffice for first-time backfill of three benchmarks (never run against real Massive data).
