# Roadmap: not built

| Item | State | Notes |
|---|---|---|
| Real-model verification | Not done | Run the assistant against OpenAI on staging; check streaming, tool rounds, cost accounting vs `ai_usage`. First thing to do before enabling. |
| Tests for route, tools, usage, benchmark-data | Not done | Needs a DB fixture and an OpenAI stub. |
| Server-side flag for `/api/assistant` | Not done | Today only the UI is flagged. |
| Assistant docking | Not built | Window is floating/draggable (geometry in `localStorage`); no dock mode. |
| Saved conversations / analyses | Not built | Conversation lives in client state; nothing persisted server-side. |
| Public board tool | Not built | The assistant says it cannot read the board. |
| Wealth Lab extras | Not built | Saved named scenarios, withdrawals/decumulation, Monte Carlo. Inputs persist only in browser `localStorage`. |
| Fund look-through | Not built | ETFs/funds stay in one bucket in sector exposure. |
| Total-return benchmarks | Not built | Needs dividend-adjusted series; current ones are price-only. |
| Replay of holdings | Not built | Needs position-history persistence; app stores daily value/flow snapshots only, so replay is value-only. |
| Accessibility and contrast audit | Not done | Glass surfaces, chips, scrubber. |
| Performance profiling | Not done | Blur, orb animation, X-Ray latency. |
| Shared (cross-instance) throttles | Not built | Benchmark retry and sector throttle are in-memory per process. |
| Down-migrations | Not written | Schema changes are additive. |
