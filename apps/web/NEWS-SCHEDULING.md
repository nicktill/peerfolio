# Scheduled News rollout

Independent of architecture-hardening PR #103. Apply additive News migration 0014 to a preview database before functional testing, and coordinate production migration before merging/deploying. No production database was modified.

## Cadence

Four separate once-daily Vercel schedules cover the two New York UTC offsets. Morning targets 11:00–11:59 ET; close targets 16:30–17:29 ET. Handlers check the local window and exchange calendar; the inactive seasonal schedule does nothing. Hobby timing is approximate. Early-close days publish at the normal afternoon time. The portfolio snapshot schedule is untouched.

Morning fetches four index ETF quotes and writes the opening-session brief. Closing fetches all fifteen index/sector quotes plus chart bars, earnings and sentiment, and replaces the morning brief. Missing completed weekly recaps are written by closing runs. A failed morning doesn't prevent a closing update.

A shared lease prevents duplicate attempts for a slot/day. Failed slots are not automatically retried that day, avoiding duplicate paid work; the next slot/day updates independently. Components retain their last successful saved data. Old/mixed-session or incomplete boards cannot replace complete ones. Initial cards remain absent until a successful scheduled refresh.

## Cost and reads

Normal quote load is four morning plus fifteen afternoon Finnhub calls/trading day, plus earnings/name lookups and batched Alpaca charts/fallback. Keyed requests use the existing shared limiter. Provider capacity/failures can still prevent updates. CNN remains unofficial; saved sentiment retains its timestamp.

Public News routes only read stored data. News uses ticker badges instead of the logo proxy, avoiding cold-cache Massive lookups; other pages retain logos. Personalized holdings opt out of provider refresh scheduling; other Portfolio consumers retain their behavior. Quotes, recaps and sector captures are timestamped. Weekly charts use the latest complete closing board. Calendar highlights are derived at read time.

AI retains the strict schema, cited-source numeric checks and spending ledger. Saved ETF quote facts are numbered sources alongside RSS headlines. The known entity-binding limitation is unchanged. Morning prompts explicitly say trading is in progress. A 40-second API timeout and job deadline guard attempts; absent key, failed checks, insufficient budget or time use headline fallback.

NEWS_AI_MONTHLY_BUDGET_USD retains the $1 default. Zero correctly disables AI; invalid configuration fails closed. No platform budget is changed. Two daily briefings plus retries can exhaust $1; fallback is deliberate. No new credentials or paid service.

Before release verify migrations, five cron definitions in Vercel, authorization, migrated preview and saved timestamps, production preview 404s, and provider outcomes. The protected original /api/cron/news remains available in the closing window; schedules use distinct /api/cron/news/* paths.
