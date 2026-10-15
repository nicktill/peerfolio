# Cost, storage and open concerns

Estimates, not measurements. Nothing here has run against the real OpenAI API; every dollar figure comes from the
token sizes in the code and the default price constants in `apps/web/src/lib/ai/limits.ts`
($0.25 per million input tokens, $2 per million output tokens, the assumed list price of `gpt-5-mini`; **verify
against the current price sheet before relying on it**, and override with `ASSISTANT_AI_INPUT_PER_M` /
`ASSISTANT_AI_OUTPUT_PER_M`).

## 1. What a question costs

Fixed part of every request (sent again on every model round): system prompt about 2.3 KB, page guidance about
0.2 KB, tool definitions about 4 KB, which is roughly 1.7k tokens. Conversation history adds up to 12 messages of
at most 2,000 characters each (about 450 tokens for a typical short chat, 6k tokens at the maximum). Tool results
add 1-2k tokens each (X-Ray, league standings, news).

| Question type | Model rounds | Input tokens | Output tokens (incl. reasoning) | Estimated cost |
|---|---|---|---|---|
| Plain follow-up, no tool | 1 | ~2.2k | ~500 | **~$0.0016** |
| One tool (X-Ray, holdings, league, benchmark) | 2 | ~6k total | ~900 | **~$0.003-0.004** |
| Two tools | 3 | ~11k total | ~1.3k | **~$0.006** |
| Practical ceiling (4 rounds, long history) | 4 | ~25k | ~2.5k | **~$0.012** |

OpenAI's automatic prompt caching would lower the input side; it is not counted. If a reasoning model spends far
more reasoning tokens than "low" effort suggests, output cost is the term that grows, which is why
`max_output_tokens` is capped at 2,500 per round.

### What the limits enforce (`limits.ts`, `usage.ts`)

| Limit | Default | Effect |
|---|---|---|
| Requests per user per rolling hour | 40 | The 41st question in an hour is refused with a plain message. |
| Spend per user per rolling day | $0.25 | Checked against the **worst-case reservation** (about $0.03-0.05) plus what's already spent, so a user is cut off at roughly $0.20 of real spend, about 60-70 typical questions. |
| Spend, everyone, per calendar month | $10 | Shared pool. When it is gone the assistant is paused for **all** users; the rest of the app is unaffected. |
| Model rounds per request | 4 | Bounds tool loops. |
| History sent | 12 messages x 2,000 chars; request refused above 24k input tokens | Bounds the "context given to the AI". |

**"Someone asks 100 questions in an hour":** they cannot. The hourly limit stops them at 40, which is about
$0.06-0.16 of real spend. A user who maxes out every day costs at most about $0.25/day, roughly $7.50/month.

### Is it fine to leave open to everyone?

Per user: yes, the cost is small and hard-bounded. The real exposure is the **shared $10 monthly pool**:

- At ~$0.003 per question the pool is about 3,000 questions a month across all users. Sizing guide at 20
  questions per active user per month (~$0.06): 100 users ~ $6, 1,000 users ~ $60, 10,000 users ~ $600.
- Accounts are cheap to create, so a handful of throwaway accounts could drain the pool (each can spend $0.25/day;
  ~40 accounts exhaust $10 in a day). The per-user limits do not stop that.
- Recommendation before opening wide: pick the monthly budget on purpose, consider lowering the per-user daily cap
  to about $0.10, roll out to a beta cohort first (the app already gates brokerage linking by beta access),
  and add an alert at 50% and 80% of the monthly pool. There is no alerting today.

## 2. Storage

**Conversations are not stored on the server.** The history lives in the browser tab (`sessionStorage`, last 20
messages, X-Ray report objects included, well under 1 MB) and is gone when the tab closes. Each request sends the
trimmed history back to the model; OpenAI is called with `store: false`. So today "storing past conversations"
costs **zero database storage**, and also means there is no cross-device or cross-session history.

What the database does gain:

| Table | Per row | Growth | Notes |
|---|---|---|---|
| `ai_usage` (0022) | ~110 B + two indexes, ~250 B total | one row per question | At the monthly cap, a few thousand rows a month, about 1 MB. Even at 1M questions it is ~250 MB. **No pruning job exists**; rows older than ~40 days are not read and can be deleted. |
| `benchmark_prices` (0023) | ~50 B | 3 symbols x ~252 trading days = ~750 rows/year | Under 100 KB a year. |
| `securities` sector columns (0024) | three nullable text/timestamp columns | one fill per held ticker | Negligible. |
| Replay | none | reads existing `portfolio_snapshots` | No new history is stored. |

If saved conversations are added later (not built): about 2-10 KB of text per conversation plus ~6 KB per saved
X-Ray. 1,000 users x 20 conversations x 8 KB is ~160 MB, which would matter on a 0.5 GB database plan, so it would
need a retention limit and per-user cap.

### Free-plan limits

I do not know which plan the database and hosting are on, so treat this as the checklist, not a verdict.
Storage is not the risk (see above). The likelier limits are **compute and function time**: each question runs
one short transaction (advisory lock, three reads, one insert, one update) plus 3-10 reads for tools, and the
streaming route can hold a serverless function open for up to its 60-second `maxDuration`. On a free database tier
that mostly affects compute-hours and connection counts (the pool is `max: 5` per instance); on a free hosting tier
it affects function duration and invocation quotas. Check both plans' function-time and compute-hour allowances
against expected traffic.

## 3. Other concerns and what is lacking

**Unverified**
- Never run against the real OpenAI API. Untested risks: strict function schemas, `reasoning.encrypted_content`
  with `store: false` across tool rounds, and actual token and reasoning usage versus the estimates above.
- No real Massive (benchmarks) or Finnhub (sectors) data was seen locally; benchmark prices were synthetic.
- Sector refresh is untested with a real key.

**Cost and abuse**
- Monthly pool is global (see above); no usage dashboard, alerts or admin view of `ai_usage`.
- A cancelled request that never reported token usage keeps its full worst-case reservation (conservative; it
  slightly shortens that user's daily allowance).
- The X-Ray cache (3 minutes) and the benchmark retry throttle are in-memory per server instance, so on serverless
  they are best-effort. Provider calls are still governed by the shared provider budgets.
- The kill switch is the environment: `NEXT_PUBLIC_ASSISTANT_ENABLED` is read at build time, so turning it off
  needs a redeploy. Setting `ASSISTANT_MONTHLY_BUDGET_USD` to a tiny value pauses the assistant at runtime.

**Privacy and safety**
- Holdings, values and league data are sent to OpenAI to answer questions. This needs to be disclosed in the
  privacy policy and the retention terms confirmed (the code requests no storage on OpenAI's side; account-level
  data-retention settings still apply).
- Prompt-injection defence is layered but not proven: tool results are labelled as data, the model has read-only
  tools only, and league and fantasy views are allow-lists. Member names and headlines are third-party text.
- No content moderation on user messages, and no automated test of answer quality.

**Product gaps**
- No saved conversations or analyses, no docked mode, no assistant access to the public board.
- Wealth Lab has no saved named scenarios, withdrawals or Monte Carlo; the assistant link to Wealth Lab may be
  mid-flight (see the roadmap file).
- Replay is value-only: historical holdings are not stored.
- Accessibility: keyboard move/resize, focus return and reduced motion are implemented; no screen-reader test pass
  and no automated accessibility check.
