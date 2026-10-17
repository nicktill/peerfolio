# Sports data plan — zero paid data budget

Requirements clarified October 17, 2026: offered pregame prices refresh until kickoff; accepted prices never change; picks become read-only at kickoff; during games show delayed scores/status/progress. Do not imply a changing win probability unless a real probability feed or validated model supplies it. No in-game trading is requested.

## Recommended direction

Use one shared, server-side ingestion pipeline for every user and league. Refresh only the selected upcoming slate; use a separate score/status feed during games. Store source timestamps and suspend new picks when quotes are too stale. Keep confirmed results/settlement independent of the display-progress feed. Reserve provider capacity for results before spending it on quote refreshes.

Multiple permanent free tiers can extend capacity. Each adapter needs its own actual billing unit, reset period, allowance, retry/backoff and data-usage permissions. Do not treat temporary trials as permanent infrastructure or sum requests, credits and returned-event objects as interchangeable units. Matching must include event time, teams, market kind, spread/total threshold and settlement rules. Switching a provider must never alter an accepted pick's price or semantics.

The current composite supports Odds API keys and an explicitly configured Odds-API-compatible adapter, not the other stored vendor keys. Dedicated adapters and operational validation are still required. Existing daily/monthly credit pacing is conservative accounting, not proof against all provider-side quota exhaustion or concurrent/manual use of the same key.

## Official sources checked

- Kalshi public REST market data is available without authentication. Its WebSocket feed requires authentication. Prefer documented API access to scraping HTML. Coverage/liquidity and data redistribution permission still need validation for this app. https://docs.kalshi.com/getting_started/quick_start_market_data
- Polymarket provides market discovery, order-book prices and real-time data APIs. Exchange prices reflect bids/asks and may have wide spreads; they are not interchangeable with bookmaker consensus. https://docs.polymarket.com/market-data/overview and https://docs.polymarket.com/concepts/prices-orderbook
- Polymarket publishes additional institutional data-licensing conditions including fintech companies. Public accessibility is not proof that redistributing data in Peerfolio is permitted for free. https://institutional.polymarket.com/
- SportsGameOdds advertises a permanent Amateur tier: 2,500 returned objects per month, 10 requests/minute and 10-minute updates. Each returned event consumes an object on each fetch. Confirm usable endpoints and app distribution permissions; its pricing labels the free tier for testing/prototyping. https://sportsgameodds.com/pricing
- The Odds API Starter includes 500 credits/month. The live test confirmed 3 credits for a US h2h/spreads/totals fetch and 2 for a scores fetch with daysFrom. https://the-odds-api.com/
- OddsPapi advertises 250 monthly requests on its free plan, with pre-match REST data. Confirm the actual account entitlement and permitted app use. https://oddspapi.io/en

## Remaining work before this experience launches

1. Choose and verify a durable free pregame feed and a score/status feed, including rights and sport coverage.
2. Model a conservative monthly budget for the selected slate; include results, retries, test calls and headroom. Enforce safe exhaustion behavior without paid auto-upgrades.
3. Implement refreshed offered lines with immutable accepted-price snapshots, and move the pick cutoff to kickoff with server-side checks.
4. Persist and render live score/status/progress with explicit as-of timestamps. Handle postponements, corrections and unavailable feeds.
5. Repeat real-API regression checks, confirm scheduled jobs are deployed/enabled, and observe a naturally completed game before widening access.
