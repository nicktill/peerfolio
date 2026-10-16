# Sports data providers

Investigation date: 2026-10-16. Method: web search only. **Every direct fetch of provider sites
failed in the sandbox (DNS/proxy: `getaddrinfo ENOTFOUND`), so no claim below was read from a
provider's own page by this investigation.** Search returned snippets of provider pages and
third-party reviews. Legend:

- **[S]** seen in a search snippet that appears to come from the provider's own domain (still not verified against the live page)
- **[T]** third-party blog/review/directory only
- **[U]** unverified / not found / from memory of the public docs; treat as a hypothesis

Nothing here is final until the owner (or a session with open network access) confirms it on the
provider's pricing page and docs. A 5-minute checklist is at the bottom.

## Requirements that drive the choice

1. Pregame odds only, NFL first, then NBA and tennis. Player props where available.
2. One fetch must serve every user (we publish fixed contest lines from a server-side cache), so
   request volume is a function of the **schedule**, not of user count.
3. Displaying odds in an app must be allowed by the terms. Credits only, no cash, no redemption.
4. A results source for settlement that is independent of the odds feed.

## Comparison

| Provider | Free tier | Props | Tennis | Results/scores | Verdict |
|---|---|---|---|---|---|
| The Odds API (the-odds-api.com) | 500 credits/mo [S/T], see conflict below | US sports, per-event endpoint [S] | Match odds yes [S]; props no evidence | `/scores` for finished games [U], no box stats | **Best first adapter** |
| SportsGameOdds | "Amateur" 10 req/min, 2,500 objects/mo [S] | Yes, in same events call [S] | No evidence found | Scores/results on every plan [S] | Strong runner-up; one source for odds + results |
| PropLine | 1,000 req/day [T] | Yes, "graded prop resolution" on paid [T] | Not confirmed | Graded resolution on paid [T] | Interesting, immature; unverified |
| BALLDONTLIE | Basic endpoints only, 5 req/min [T] | Odds/props need GOAT ~$39.99/mo per sport [T] | No evidence | Stats yes (paid tiers) | Best as a **results/stats** source, not odds |
| TheRundown | Daily cap, free key [S]; "200K/mo" [T] | Not confirmed | Not confirmed | Not confirmed | Unverified |
| OddsPapi | "350+ bookmakers" free marketing [T] | Not confirmed | Claims broad coverage [T] | Not confirmed | Unverified |
| Unabated | No public API found | n/a | n/a | n/a | Not usable (no evidence of self-serve API) |
| ESPN public JSON | Free, unofficial | Box scores (player stats) | Scoreboard only | Yes, for settlement | Fine for settlement, **no ToS right to rely on it**; keep behind our adapter |

## The Odds API: the free-tier conflict

Earlier snippets disagreed (h2h only vs all markets). What I could establish:

- **[S]** Homepage advertises a free tier with 500 credits/month (page may be old).
- **[S]** Docs: usage cost is **markets x regions** per call; each market costs 1 per region. Nothing in the snippet says markets are restricted by plan, which supports "all markets, metered by credits".
- **[S]** Player props are fetched **one event at a time** via the event-odds endpoint and cost 1 credit per market per region. Coverage is mostly US sports and US books.
- **[S]** Historical odds are paid-plan only.
- **[T]** Paid: $30 / 20k credits, $59 / 100k, $119 / 5M.
- **[T, conflicting]** A different domain (`theoddsapi.com`, apparently not the same company as the-odds-api.com) says free = moneylines only and props = Business tier. This is the likely source of the "h2h only" claim. **Do not confuse the two domains.**

**Resolution (best available, unverified):** on the-odds-api.com the free plan appears to be limited
by credit quota, not by market type. Props should work on free but the quota is tiny: one NFL
slate of 14 games x 4 prop markets x 1 region = 56 credits per refresh. So free is enough for
development and a small private beta, not production. **[U] Confirm by calling
`/v4/sports/americanfootball_nfl/events/{id}/odds?markets=player_pass_yds` with a free key and
reading `x-requests-remaining` / `x-requests-last`.**

Update delay: pre-match odds refresh roughly every 60 s on paid plans [U]; irrelevant for us
because we publish from a cache on a schedule.

## Props coverage by sport

- **NFL**: broadly available (pass/rush/rec yards, TDs, receptions) on The Odds API and SportsGameOdds [S]. Most mature.
- **NBA**: available (points, rebounds, assists, PRA, threes) [S]. Good.
- **Tennis**: match winner, game spreads and total games are the realistic markets. **No evidence of player props from any provider; assume none.** Product decision: tennis ships as match winner + total games only. Retirement/walkover risk is handled as a void (see DESIGN.md).

## Results and settlement

Principle: settle from a **different source than the one that priced the line**, so one bad feed
cannot both price and grade a pick.

- Game results (moneyline/spread/total): The Odds API `/scores` [U] or SportsGameOdds results [S] as primary; ESPN scoreboard JSON as second source. Settle only when **two sources agree**, otherwise hold the market in `needs_review` (admin resolves).
- Player prop results need box-score stats: ESPN box score JSON (unofficial) or BALLDONTLIE paid stats. Props with no agreed stat source are voided rather than guessed. Props are therefore Phase 3.
- Stat corrections: settle after a delay (default 6 h post-final) and treat settlement as final; later corrections are ignored by policy (DESIGN.md).

## Terms of use for displaying odds

**All [U].** I could not read any provider's terms. Things to check: (a) is display to end users of
a consumer app allowed on free/paid plans; (b) attribution; (c) caching limits; (d) restrictions
on use near gambling. We show only **our published contest lines** (consensus plus a fixed margin,
not raw per-book odds), which lowers redistribution exposure but is still derived from licensed
data. Ask each shortlisted vendor in writing before launch. Never show bookmaker names or raw
book prices in the UI.

## Cost at scale

Fetch volume is independent of user count. Assume one publish per day per sport plus pre-lock
re-checks, US region only.

| Item | Credits/day (in season) |
|---|---|
| NFL game lines (3 markets, 1 call) | 3 |
| NFL props: ~14 games x 4 markets | 56 |
| NBA game lines | 3 |
| NBA props: ~10 games x 4 markets | 40 |
| Tennis match lines (2 markets x ~3 tournaments) | ~6 |
| Re-check before lock | roughly x2 |
| **Total** | **~200-300/day, ~6-9k/month** |

- **1k users**: ~6-9k credits/month, so the $30 plan (20k) suffices: **~$30/mo**.
- **10k users**: unchanged volume: **~$30/mo** for odds. Costs that grow with users are DB and compute.
- Free (500/mo) covers game lines for about one sport, not props.
- SportsGameOdds: paid plans quoted at $99-$149/mo [T, conflicting]; pricier but includes results.
- BALLDONTLIE stats for prop settlement: ~$39.99/mo per sport [T].

## Recommendation

1. **Odds: The Odds API.** Adapter: `apps/web/src/lib/sports/providers/the-odds-api.ts`. Cheap, well-known response shape (PropLine claims compatibility, so a swap is a base-URL change), props supported on paper.
2. **Results: second, independent source** behind the `ResultsProvider` interface (The Odds API `/scores` now, ESPN/BALLDONTLIE later).
3. **Launch scope**: NFL and NBA game lines first, props second, tennis match lines only.

## Owner verification checklist (5 minutes)

1. Create a free key at the-odds-api.com. Call the per-event odds endpoint with a prop market and confirm props work on free and the credit cost.
2. Read the Terms; ask support whether display of derived odds in a consumer app is permitted.
3. Confirm `/scores` returns finals for NFL/NBA/tennis and how far back (`daysFrom`).
4. Confirm the pricing page numbers above.

## Sources (search results, not read directly)

- https://the-odds-api.com/liveapi/guides/v4/ and https://the-odds-api.com/sports-odds-data/betting-markets.html
- https://sportsapis.dev/apis/the-odds-api and https://oddspapi.io/blog/?p=2967 (third-party reviews)
- https://sportsgameodds.com/docs/faq and https://sportsgameodds.com/blog/player-prop-odds-api-provider-guide
- https://theoddsapi.com/ (different company; source of the "moneyline-only free" claim)
- Capterra/GetApp PropLine listings; https://docs.therundown.io/rate-limits; Highlightly "Best NBA APIs in 2026" (BALLDONTLIE tiers)
