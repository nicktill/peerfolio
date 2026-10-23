# Infrastructure budget checks

Admin → Infrastructure shows scoped usage, threshold warnings, estimated period-end usage and runway. The daily **Infrastructure budget check** GitHub workflow runs at 13:17 UTC and can be dispatched manually. It exits nonzero for 75%/90% usage, forecast overrun, missing configuration, invalid scope/period, unavailable provider, or stale snapshots. At 60% the admin page shows watch status. GitHub notifications depend on your account's workflow notification preferences; a failed job is not a delivery guarantee.

The scheduler runs a dependency-free Node checker directly, without calling the application or database. It does not wake Neon compute. Admin access uses the existing signed-in administrator permission checks, which can query the application database. Requests to the Neon control plane time out after ten seconds; admin results cache for five minutes. Refresh does not bypass that server cache. No picks, odds refresh or user data are altered by monitoring.

## Configure Neon monitoring

Set the same configuration in Vercel's server environment and GitHub repository Actions variables/secrets; they are independent environments. No credentials or account-specific readings are committed.

- `NEON_PROJECT_ID`: the exact production project ID (never an organization total).
- `NEON_API_KEY`: secret, existing key with read access to that project. Do not expose it in a `NEXT_PUBLIC_` variable.
- `INFRA_NEON_LIMIT_CU_HOURS`: configured monthly allowance (defaults to 100; check your actual current plan).
- `NEON_PROJECT_COUNTER_VERIFIED=true`: opt in only after comparing GetProject's current-period `compute_time_seconds / 3600` with that project's console CU-hours reading. Check the period boundaries match. Do not infer this from an organization total or a deprecated `cpu_used_sec` field.

The adapter reads `GET /api/v2/projects/{project_id}` and accepts only the exact project, a finite nonnegative counter, and a current monthly period. Neon documents the counter as CPU seconds reset each billing period, including deleted endpoints, with reporting lag. We label it **an estimate**, not invoice-accurate consumption. A successfully fetched counter does not prove the underlying billing meter is fresh. Compare with the console periodically and after plan changes; turn off the opt-in if they diverge. Invalid periods (including year 0001), missing counters, authentication failures and timeouts produce unknown status.

Neon's invoice-aligned `/consumption_history/v2/projects` API is documented for paid usage-based plans, not Free. We deliberately do not call it. Missing Free-plan access must never be interpreted as zero usage.

Sources: [Neon official OpenAPI Project schema](https://github.com/neondatabase/neon-api-python/blob/main/v2.json), [consumption API plan availability](https://neon.com/docs/guides/consumption-metrics).

## Console snapshot fallback and Vercel

`INFRA_NEON_SNAPSHOT` optionally overrides the automatic reader. Set `INFRA_VERCEL_SCOPE` to the exact team/account scope whose allowance is consumed; set `INFRA_VERCEL_CPU_SNAPSHOT` and `INFRA_VERCEL_INVOCATIONS_SNAPSHOT` from the matching Vercel usage dashboard. Project-only usage is insufficient if other projects share that team allowance. Vercel metrics are explicitly unmonitored until configured; they never silently disappear from the overall check. Current Pro readings can be compared with proposed Hobby budgets, but this monitor does not certify Hobby eligibility or cover every Vercel resource.

Snapshots are JSON objects; substitute real current-period values, never reuse these examples as readings:

```json
{"scope":"YOUR_PROJECT_ID","unit":"CU-hours","used":0,"limit":100,"periodStart":"CURRENT_PERIOD_START_ISO","periodEnd":"CURRENT_PERIOD_END_ISO","observedAt":"CONSOLE_READING_TIME_ISO","source":"console"}
```

Vercel CPU uses unit `CPU-hours`; invocations uses `invocations`. Set their actual comparison limits (for example a target allowance confirmed from current provider documentation). Readings must be observed within 36 hours, at or after period start, and within a currently active monthly period. Reenter snapshots when periods reset. Observation time means when you read the dashboard, not when you deploy the configuration. Invalid manual JSON fails visibly instead of falling back to an automatic number.

## Verify and operate

Run `node --experimental-strip-types apps/web/scripts/check-infrastructure-budget.mts` with these environment variables. Missing configuration intentionally fails. Dispatch the workflow after configuration, verify its exact project/team scope against the consoles, and check Admin → Infrastructure on production. The workflow source must be on the default branch for scheduled runs. GitHub may delay scheduled jobs and disables inactive public-repository schedules after 60 days; configure GitHub Actions failure notifications and check recent runs. Deploying source alone does not activate credible monitoring.

Forecast uses the entire period's average at observation time, after the first day. It is a rough trend, not a promise; recent optimizations and traffic bursts can change it. Runway is the remaining allowance divided by that average daily rate, not a recent-rate forecast. This first pass covers Neon compute plus Vercel active CPU and invocation targets; storage, transfer, image transformations and other provider limits still need separate review.
