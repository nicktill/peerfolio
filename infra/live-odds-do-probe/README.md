# Durable Object CPU probe (throwaway)

Question: can the live odds worker's hottest step run inside a Cloudflare Durable Object alarm on the **Workers Free** plan?
Cloudflare's docs say Durable Objects have the same per-invocation CPU limits as Workers (Free: 10 ms). Measured in Node on real
Polymarket data, `JSON.parse` plus the app's `parseGammaEvents` costs: NBA page 62 ms (13 MB), college football 23 ms (8.5 MB),
EPL 7 ms, NHL 6 ms. Locally (workerd, no limits enforced) the probe runs and finds the 13 NBA games, so only the Free CPU cap is in doubt.

Settle it on the real plan (no secrets, no database, stores one string):
```bash
cd infra/live-odds-do-probe && npm install
npx wrangler login
npx wrangler deploy
curl "https://peerfolio-live-odds-probe.<your-subdomain>.workers.dev/?sport=nba"   # arms a 30 s alarm loop
npx wrangler tail --format json                                                     # read outcome and cpuTime per alarm
```
`"outcome":"exceededCpu"` (or `exceededMemory`) means the port cannot run on Free. `"ok"` with `cpuTime` under 10 means it can.
Clean up: `npx wrangler delete --name peerfolio-live-odds-probe`.
