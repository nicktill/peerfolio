p='../../docs/sports/LIVE-ODDS.md'
s=open(p).read()
def rep(a,b):
    global s
    assert a in s,a[:60]
    s=s.replace(a,b,1)

# constants table
a=s.index('| Constant | Value | Meaning |')
b=s.index('**Mechanism.**')
s=s[:a]+'''| Constant | Value | Meaning |
|---|---|---|
| `maxAgeMs` | 60s | our read of the book must be this fresh |
| `maxSpread` | 3 pts | widest bid/ask gap priced from |
| `minTopSize` | 200 shares | least size at BOTH best levels of BOTH outcome books (a thin top of book is cheap to move); Kalshi reports no sizes here, so it is a cross-check only and never reprices alone |
| `minFair` | 15% (85%) | fair probabilities outside this range are never repriced; the market freezes (a stale longshot price is the costliest) |
| `maxBookTsAgeMs` | 10 min | a book timestamp older than this is a stuck feed |
| `disagree` | 5 pts | Polymarket vs Kalshi further apart: hold the current line |
| `minMove` | 1.5 pts | fair probability must drift this far from the last priced basis to write |
| `minIntervalMs` | 30s | at most one write per market in this time (also re-checked inside the lock) |
| `maxStep` | 4 pts | a bigger single move freezes the market instead of repricing |
| `hourRange` | 15 pts | total range of fair probability over an hour above this freezes it |
| `firstContactMax` | 12 pts | first exchange read vs the published consensus basis: allowed only when Polymarket and Kalshi agree, otherwise `maxStep` applies, else freeze |
| `staleFreezeMs` | 10 min | a market the exchange manages freezes if no good read arrives for this long |
| `confirmEveryMs` | 2 min | healthy-but-unchanged markets are re-stamped this often |
| `windowMs` / `passMs` / `farPassMs` | 3h / 30s / 5 min | games inside 3h of the start are repriced every 30s; further out every 5 min while the worker is up |
| `workerDeadMs` | 5 min | the publish cron freezes exchange-managed markets starting within `windowMs` when the worker heartbeat is older than this |

'''+s[b:]
rep('The write happens in one transaction under the EXCLUSIVE market row lock','The write happens in one transaction under the EXCLUSIVE market row lock (and is refused unless `LIVE_ODDS_ENABLED=1`)')
rep('Inside the lock the write re-checks, on the server clock, that the market is open, unlocked and not started (kickoff is refused at the exact start instant), and is a compare-and-set on the basis the decision used,','Inside the lock the write re-checks, on the server clock, that the market is a moneyline, open, unlocked and not started (kickoff is refused at the exact start instant), that the minimum interval since the last write has passed, and is a compare-and-set on the basis AND the write count (version) the decision used,')
rep('Pick placement now reads the line AFTER taking the market lock','Pick placement now reads the line AFTER taking the market lock, and takes its clock from the database inside the transaction after the market and member locks are held (and again on every deadlock retry), so a pick that waited behind a lock is judged against kickoff at the instant it can run and `acceptedAt` is that instant. Before this it read the line first')
rep('Pick placement now reads the line AFTER taking the market lock, and takes its clock from the database inside the transaction after the market and member locks are held (and again on every deadlock retry), so a pick that waited behind a lock is judged against kickoff at the instant it can run and `acceptedAt` is that instant. Before this it read the line first (before this change it read it first, which would have let','Pick placement now reads the line AFTER taking the market lock, and takes its clock from the database inside the transaction after the market and member locks are held (and again on every deadlock retry), so a pick that waited behind a lock is judged against kickoff at the instant it can run and `acceptedAt` is that instant. (Before, it read the line first, which would have let')
rep('the league page refetches every 20s, shows the slip at the latest price, flags "Price updated from X to Y", and refetches on that error.','the league page refetches every 20s (paused while the tab is hidden), shows the slip at the latest price, and when the price moved under the user it announces "Price updated from X to Y" in a polite live region and keeps Lock disabled until they press "Accept new price". If the selected market freezes or locks while on the slip, the slip stays with an explanation and a Dismiss button instead of silently clearing.')
rep('the consensus drift freeze is skipped only while the exchange confirmed the market within 15 minutes.','the consensus drift freeze is skipped only while the exchange confirmed the market within 5 minutes AND the worker heartbeat is under 5 minutes old.')
rep('no longer counts a market the exchange confirmed in the last 15 minutes,','no longer counts a market the exchange confirmed in the last 5 minutes (while the worker is alive),')
rep('(60s passes: 2 reads and one batched exchange call) through the games; with open markets only further out it wakes every 15 minutes. Writes happen only when a price actually moves by 1.5 points or more (a handful per market per day), plus a confirm stamp at most every 5 minutes.','(30s passes: 2 reads and one batched exchange call) through the games; with open markets only further out it wakes every 5 minutes. Writes happen only when a price actually moves by 1.5 points or more (a handful per market per day), plus a confirm stamp at most every 2 minutes.')
rep('and nothing at all if `LIVE_ODDS_ENABLED=0`.','and nothing at all unless `LIVE_ODDS_ENABLED=1` (the worker idles without touching the database otherwise).')
rep('Set `LIVE_ODDS_ENABLED=0` to turn the worker off completely (it idles without touching the database).','Leaving `LIVE_ODDS_ENABLED` unset (or not `1`) turns the worker off completely.')
rep('DATABASE_URL=postgres://... node --experimental-strip-types scripts/live-odds-worker.mts [--ws] [--once]','LIVE_ODDS_ENABLED=1 DATABASE_URL=postgres://... node --experimental-strip-types scripts/live-odds-worker.mts [--ws] [--once]')
rep('`LIVE_ODDS_ENABLED=0` idles it. It logs a one-line summary every minute.','**Master switch:** it does nothing unless `LIVE_ODDS_ENABLED=1` is set explicitly (the sports flag `NEXT_PUBLIC_SPORTS_ENABLED` is not visible to a standalone worker). Pointing it at a production database with `LIVE_ODDS_ENABLED=1` acts on that database\'s OPEN markets: it reprices lines and freezes markets. Do that only when you intend those markets to be live. It logs a one-line summary every minute.')
rep('`cd apps/web && DATABASE_URL=... node --experimental-strip-types','`cd apps/web && LIVE_ODDS_ENABLED=1 DATABASE_URL=... node --experimental-strip-types')
rep('a job is capped at 6 hours, so it runs `timeout 5h50m` and a new one is scheduled every 6 hours (05:20, 11:20, 17:20, 23:20 UTC), which leaves a **handover gap of roughly 10 to 40 minutes** with no worker','a job is capped at 6 hours, so it runs `timeout 5h50m` and a new one is queued every 2 hours (at :20 past even hours UTC; GitHub keeps only the newest pending run per concurrency group and cancels older ones, which show as cancelled runs and are expected), so a successor is already waiting when the running job ends and the **handover gap is the runner start plus `npm ci`, about 1 to 2 minutes**. If the worker is ever down for more than 5 minutes, the publish cron freezes exchange-managed markets starting within 3 hours (see the guard below). Without a successor (for example the repository variable was switched off) there would be a gap')
s=s.replace('(live odds show "Odds paused" if a game falls inside it; the score and everything else are unaffected)','(live odds show "Odds paused" if a game falls inside it)')
rep('If a game is on during a gap, press "Run workflow" to start one straight away (it queues behind the running job, so only when none is running).','To start one straight away press "Run workflow" (it queues behind a running job).')

# residual risk section before Upstream load
marker='## Upstream load scales with games, not users'
risk='''## Worker-dead guard

The publish cron (every 15 minutes) calls `freezeUnguardedMarkets`: if the `live_worker` heartbeat is older than 5 minutes (or missing), every exchange-managed open market that starts within 3 hours is frozen (one-way, reason "live odds worker not running"), and markets further out stop being trusted: they buy a paid guard fetch again and the consensus drift freeze applies. The worker beats at least every 30s while any market is within 3h, so a healthy worker never trips it. A GitHub Actions handover gap longer than 5 minutes would freeze markets near kickoff; that is the intended fail-safe.

## Residual risk: how stale can an offered price be

Picks stay open until kickoff, so the offered line is a price against a moving market. Accepted picks are unaffected; this is about how far a new pick can be from the exchange. Numbers at the 2% margin (`staleness.test.ts` sweeps them): EV of the favourable side per credit staked when the true fair probability has drifted by d points since the line was priced.

| fair prob | d = 0 | d = 1.5 (minMove) | d = 3 | d = 4 (maxStep) |
|---|---|---|---|---|
| 15% / 85% | -1.2% | +3.1% / +2.3% | +12.5% / +11.6% | +18.8% / +17.8% |
| 25% / 75% | -1.6% | +0.7% | +6.4% | +10.2% |
| 35% / 65% | -1.7% | +0.6% | +4.5% | +7.2% |
| 50% | -2.4% | +0.5% | +3.5% | +5.4% |

Where d comes from, worst case:
1. **Below `minMove` (1.5 pts)** the line is deliberately not moved: up to about +0.5% EV at an even game and +3% on a 15% longshot.
2. **Between passes.** The line in the database lags the exchange by up to one pass (30s inside 3h of the start, 5 min further out) plus the cycle (about 2s) plus the age of the read (up to 60s allowed, typically 1-2s): roughly 35s typical worst case, 95s at the extreme, for moves the exchange makes in that time. A move above `maxStep` (4 pts) is not followed but freezes the market at the next pass, so the unreflected window for a jump is the same 35-95s: up to +5.4% EV at an even game, +10% at 25%, +19% at 15% (the 15% edge is the repricing boundary; below it markets are frozen).
3. **Worker outage.** Up to 5 minutes until the publish cron notices (it runs every 15 minutes, so up to 15 minutes in the worst alignment), then the market freezes.
4. **Thin books.** The 200-share top-of-book and 3-point spread requirements make a cheap push on the mid hard; a determined actor with real size on the exchange can still move a mid within the 30s pass. Per-pick limits bound the damage: stake at most 10% of starting credits, return at most 50%, 20 open picks, 60% exposure.

This is a play-money game, so the rule of thumb is: the edge available to a fast reader of the exchange is a few percent on ordinary games and larger only on longshots and in the first 35-95 seconds after a jump. Tighten `passMs`, `maxStep` or `minFair` if leaderboards show abuse.

'''
s=s.replace(marker, risk+marker,1)
open(p,'w').write(s)
