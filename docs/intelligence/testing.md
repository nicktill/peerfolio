# Testing

## Automated

`npm test` in `apps/web` (Node test runner): **852 tests, 181 suites, 0 failures, 0 skipped** (run on this branch when this document was written; ~16 s). Includes the whole repo's tests, not only the new ones.

New test files:

| Area | Files |
|---|---|
| `src/lib/ai/` | `portfolio-xray.test.ts`, `risk-metrics.test.ts`, `sectors.test.ts`, `limits.test.ts`, `league-view.test.ts`, `fantasy-view.test.ts`, `news-match.test.ts` |
| `src/lib/wealth/` | `engine.test.ts` |
| Replay | `src/lib/replay.test.ts` |
| Benchmarks | `src/lib/benchmarks.test.ts` |

Pure logic is what is covered: X-Ray math and flags, drawdown/volatility, sector mapping, spend decision rules and input cleaning, allow-list shaping, benchmark indexing, replay frames and stepping, wealth projections.

## Verified manually (as reported by the sessions that built it; not re-run here)

- In a browser against a local app: assistant window open/close/morph, X-Ray rendering, benchmark chips and chart, replay playback, Wealth Lab sliders and chart.
- Benchmark numbers were checked with **synthetic** `benchmark_prices`.

## Not covered

- `route.ts` (stream, tool loop, 401/413/429/503 paths) and `tools.ts`: no tests.
- `usage.ts` (`reserve`/`settle` SQL, advisory lock, concurrency): no tests; needs a database.
- `benchmark-data.ts` (backfill/forward fetch, retry map), `/api/portfolio/benchmark`, `refreshSecuritySectors`: no tests.
- No component/UI tests, no end-to-end tests, no accessibility or visual regression tests.
- Never exercised against a real OpenAI, Finnhub or Massive response (see [risks.md](risks.md)).
- Prompt-injection and cross-user attempts have not been tested adversarially.
