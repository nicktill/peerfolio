# Private live paper tests

This is an admin-only quote acceptance experiment, not live league betting. The server uses the existing `ADMIN_EMAILS` allowlist and signed-in sports access on every route. No new credentials or feature flag changes are needed. `NEXTAUTH_SECRET` must already be configured; without it capability stays disabled. Every allowlisted admin has access; league ownership alone grants nothing.

On a real tracked in-progress game, an admin can expand **Admin · live paper test**, refresh a signed offer and test a 10–100 play-cash stake. Non-admins see no panel and receive 404 from its API. Sample previews must not mount the panel. Only exchange probabilities are eligible; ESPN models, low confidence, source disagreements, invalid scores, missing period and score/quote observations over 15 seconds old pause testing.

Offers expire after 20 seconds and are signed for the requesting user and event. Submission rereads the worker's database data, checks the displayed price, claims a one-use nonce in the existing shared `sports_rate_limits` request table, waits 12 seconds, then rereads again. Status must still be live. Source, probability, score and period must be unchanged, and both quote and score must have observations newer than submission. The clock may advance normally. A rejected attempt consumes its offer and requires a new one. No request contacts an upstream provider.

Accepted responses snapshot offered and accepted odds, source, scores, clocks, quote/state timestamps, delay and ages. The panel retains up to 20 accepted receipts per game in this browser's local storage. This local history is optional and editable, not an audit ledger. Nonces are shared across instances to prevent one signed offer being accepted twice, and are pruned after two days on subsequent test submissions.

No league cash is debited, no league pick is created, no standings change and no winnings are paid. There is no automatic grading or P&L. The receipt reports a **hypothetical total return**, not a credited payout.

## Limits of the experiment

The production worker still polls approximately every 10 seconds. A 12-second delay and fresh rereads can catch some intervening events but cannot guarantee the score and odds provider has reported every real-world event. Transient score/quote changes that reverse between reads are not observed. The stored live view does not expose top-of-book depth or provider sequence numbers, so these tests do not validate liquidity, event ordering or safe public in-play acceptance. Stalled feeds or quiet books can conservatively reject tests. Success is not evidence that public live betting is safe.

The normal pregame acceptance path, kickoff lock and accepted-price snapshots are unchanged. Public in-play wagering remains disabled.
