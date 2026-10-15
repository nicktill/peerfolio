# Risk register

Likelihood / impact: L = low, M = medium, H = high. Status is as of this branch, from reading the code and tests; "Open" means no mitigation exists or it is unverified.

## Financial accuracy

| Risk | L | I | Mitigation | Status |
|---|---|---|---|---|
| Performance numbers differ from what users expect (TWR vs dollar change) | M | M | Chart switches to returns (deposits removed) when a benchmark is on; X-Ray labels TWR period and window; system prompt forbids the model computing figures itself | Mitigated; wording in UI not audited |
| Benchmarks are **price-only, dividends excluded** (understates SPY/QQQ/VTI by roughly the yield), so a portfolio with dividends compares favorably | H | M | `basis: "price"` in the API; prompt tells the model to state it; UI note | Disclosed, not fixed (total-return series not built) |
| Stored vs live prices: X-Ray, fantasy and replay use stored closes (`closePrice`, `closePriceAsOf`), the portfolio page may show live quotes | M | M | X-Ray reports `asOf`; fantasy prompt says prices are stored | Disclosed; the `asOf` freshness threshold is not enforced |
| Snapshot gaps: one snapshot per day; missing days give no replay frame; TWR needs >= 2 tracked days | M | M | `trackedWindow` returns null; benchmark returns `no-history` / `starts-late` (start must be within 5 days of a close); replay never interpolates | Mitigated by design |
| Sector coverage partial; funds not looked through, so tech-heavy ETFs look "diversified" | H | M | `coverage`/`partial` flags, separate "Funds & ETFs" bucket; `SECTOR_MIN_HOLDINGS` | Disclosed; look-through not built |
| Risk-flag thresholds are heuristics (25 % holding, 70 % top-5, ...) | M | L | Named constants, summaries say heuristic | Accepted |
| Wealth Lab projections read as forecasts | M | M | Deterministic compound math from user inputs, scenario spread +-2 pts | Wording not audited |

## Auth and cross-user leakage

| Risk | L | I | Mitigation | Status |
|---|---|---|---|---|
| Model fetches another user's data | L | H | Tools get `userId` from the session, never from model arguments; queries filter by `userId`; strict function schemas | Mitigated; **no automated test exercises `tools.ts`** |
| League member data exposed beyond intent | L | H | `requireMembership` before any league read; `league-view.ts` / `fantasy-view.ts` are allow-list shapers (tested) | Mitigated |
| Prompt injection via league/holding names, headlines | M | M | System prompt: tool results are data; model is read-only (no write tools exist); output is plain text | Mitigated in depth, **not red-teamed** |
| Page `entityId` spoofed by client | L | M | Treated as a hint; membership checked | Mitigated |
| `/api/assistant` reachable when UI flag is off | M | L | Only auth + key + spend caps gate it | Open (flag is client-side only) |

## Cost

| Risk | L | I | Mitigation | Status |
|---|---|---|---|---|
| AI spend runaway | L | H | Worst-case reservation before the call, advisory-lock transaction, hourly count, per-user daily and global monthly caps, 4-round and 2,500-output-token caps, 24k-input bound; failed requests keep reservation | Mitigated and unit-tested (`limits.test.ts`); `usage.ts` DB path **untested** |
| Pricing drift (model price changes) | M | L | `ASSISTANT_AI_INPUT_PER_M` / `_OUTPUT_PER_M` env | Manual |
| Provider cost from benchmarks/sectors | L | M | No per-viewer calls: benchmark fetches only missing days (6 h retry, per instance); sectors only after X-Ray, 5 per run, 60 s throttle, 30-day retry; assistant fantasy tool uses `refresh:false` | Mitigated; real-provider behavior unverified |
| Per-instance in-memory throttles multiply on serverless | M | L | DB-stored data prevents repeat fetches once filled | Accepted |

## Performance

| Risk | L | I | Mitigation | Status |
|---|---|---|---|---|
| Animation / blur cost on weak devices | M | L | Transform/opacity animations, reduced-motion stops them | Not profiled |
| Replay `requestAnimationFrame` loop | L | L | Stops at end | Not profiled |
| X-Ray latency (several queries) | M | L | Parallel loads; assistant streams status | Not measured |
| Polling | - | - | No polling added by this work (replay is client-side playback) | n/a |

## Regressions to existing flows

| Risk | L | I | Mitigation | Status |
|---|---|---|---|---|
| Fantasy order fills / price refresh triggered by the assistant | L | H | `loadFantasyLeague(..., { refresh: false })`; league list uses a plain query | Mitigated; no test pins it |
| Plaid flows | L | H | No Plaid code touched by design; X-Ray reads active accounts only | Not independently diffed for this document |
| Portfolio page and chart | M | M | Benchmark is a separate route so an outage cannot break the page; off by default per viewer | Mitigated |
| Migrations | L | M | Additive only | Not run against production data |

## Accessibility

| Risk | L | I | Mitigation | Status |
|---|---|---|---|---|
| Keyboard / screen-reader use of window, scrubber, chips | M | M | Focus ring, `role="status"` regions, orb `aria-hidden`, focus moved to input on open | **No audit performed**; contrast on glass unmeasured |
| Reduced motion | L | L | Assistant CSS block + `MotionConfig reducedMotion="user"` | Verified in code only |

## Unverified (never done)

- Never run against a real OpenAI model; the stream parsing, tool loop and settle path are untested end to end.
- No real Finnhub or Massive data seen locally; benchmark prices were synthetic.
- Sector refresh not tested with a real Finnhub key.
- Production build (`next build`) of the fully merged branch not confirmed by this document.
- Migrations 0022-0024 not applied to a production-like database in this review.
