# Peerfolio Plaid hardening handoff

Date: October 6, 2026. Review branch: `codex/plaid-production-hardening`.
Base: `3913469` on `main`. Three agents reviewed sync/accounting, Link lifecycle/security, and database/rollout verification; the primary agent consolidated the changes.

## Release status

The branch is prepared for review and staged testing. Do not link a real account on an older deployment. Production approval is user-reported and has not been independently confirmed. No production secrets were changed, production migration run, branch merged, or production deployment requested during this work.

The test harness uses mocked Plaid responses and a disposable local Postgres database. It is not evidence of real institution coverage, successful browser OAuth, production Investments permission, or webhook delivery.

## What changed

- **Authoritative, atomic imports:** investment balances come from the same holdings response as the positions. Missing accounts, balances, or position values abort the import. Holdings are replaced within the relevant institution accounts, including empty lists; removed accounts become inactive. Failure preserves the previous financial data and last successful sync timestamp.
- **Cash-flow accounting:** a persistent ledger identifies transactions and their accounts, paginates the complete history window, handles corrected/canceled flows, and prevents concurrent cron/manual/webhook refreshes from applying a deposit repeatedly. Removed-account withdrawals cannot also count against structural account removal. Retirement contribution/purchase direction is corrected.
- **Account baselines:** the first imported UTC day is the baseline day. Its balance changes count as capital rather than return. Later-arriving transactions dated on or before that baseline cannot manufacture a gain or loss. Performance tracking begins after the baseline day.
- **Recovery:** transient errors retry twice, API calls have a 15-second timeout, user refreshes share a 90-second deadline, and sync locks have a 10-second timeout. Failed refreshes produce a partial/error response instead of an unconditional success message. Historical-data-ready webhooks trigger recovery.
- **Link lifecycle:** reconnect uses the existing Item, including through OAuth; expired or consumed Link tokens renew; initial token errors have retry controls; duplicate completion is guarded. Institution identity is obtained from Plaid rather than trusted from the browser. A new connection that cannot be saved or verified is cleaned up remotely when possible.
- **Disconnect/deletion:** unexpected Plaid removal failures preserve the encrypted token and local records for retry. Account deletion serializes with Link/sync writes. Already-removed tokens can be cleaned up locally.
- **Webhook/security:** signatures, exact body hashes, key expiration, issuance time, and body shape are checked. Environment typos fail explicitly. No Plaid access token is returned to the browser.
- **Verification:** signed investment equity is retained rather than made positive. Failed/missing/stale connections cannot qualify for public rankings; rankings recheck current connection health. Imported snapshot verification requires contributing Items to have successfully synced that UTC day. Live verification allows up to 48 hours since a successful import.
- **CI:** a dedicated GitHub Actions job exercises the database-backed Plaid regressions without production credentials.
- **Restricted beta:** new brokerage linking is disabled for every user by default. A server-authorized `/admin/brokerages` page lets allowlisted admins enable selected users. New Link tokens and exchanges enforce permission; existing Item repair, sync, and removal remain available after revocation. Production exchanges reserve a durable global budget before contacting Plaid, including uncertain attempts; disconnect and user deletion never restore slots. Sandbox does not consume Production capacity.

## Validation

- Web unit suite: 451 tests passed.
- Web TypeScript, zero-warning ESLint, and production build passed. The build required network access for the app's Google Fonts.
- Fresh generated migrations `0014` and `0015` and the database integration harness passed in disposable Postgres. Cases cover sold/empty positions, failure rollback, pagination failures, concurrent flows, corrections/cancellations, baseline changes, contributions, missing values, signed margin balances, currency rejection, stale verification, duplicate ownership, metadata failure cleanup, OAuth state helpers, and disconnect/account deletion failure recovery. Access cases cover non-admin rejection, admin toggles, zero Plaid calls for denied users, permission revocation cleanup, concurrent exchanges at cap one, Sandbox exemption, and capacity surviving disconnect/user deletion.
- Drizzle's matching snapshots and migration journal are included so later generated migrations recognize this schema.
- Local browser verification confirmed the admin page, quota display, and persisted enable/disable controls using disposable fixtures. No real user permissions or Plaid connections changed.

## Limits to keep visible

- This beta supports USD account/holding valuations and long positions. Unknown/foreign currency, missing values, and short holdings fail explicitly and preserve previous data. Signed margin-account equity remains supported.
- One connection per institution per user is enforced conservatively. Multiple accounts within it work; multiple independent logins at the same brokerage need future account-level duplicate detection.
- Late transactions/corrections are accounted for on import day. Daily return attribution remains approximate and requires real-institution review before public rankings are relied on.
- Cleanup can fail during a Plaid outage; retry/support may still be necessary. Sanitized identifiers are logged, not access tokens.
- Initial performance history is not backfilled or repaired by this migration.
- The app's quota tracker starts at rollout and cannot discover prior/outside-app Production Items. Set `PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED` using Plaid dashboard usage. Reserved/uncertain exchanges consume capacity conservatively even if no usable connection results. The Trial limit is 10 lifetime Production Items, not 10 active users or brokerage accounts; removal does not free a slot ([Plaid billing docs](https://plaid.com/docs/account/billing/)). Production approval alone does not establish whether the team is on Trial or a paid plan.

## Review and rollout order

1. Review this branch and its cash-flow/baseline policy. Confirm that no older variant of migration `0014` has already been applied anywhere. If it has, create a forward migration instead of assuming rerunning `0014` upgrades it.
2. Apply committed migrations to an isolated Neon branch, point the preview at it, and test actual Sandbox Link/OAuth/webhooks. The destructive database harness is restricted to its disposable local database and must not be pointed at Neon/production.
3. Verify actual Production Investments approval, keys, redirect registration, and HTTPS webhook delivery. Keep real testing restricted to the intended beta users.
4. Back up production and apply the reviewed migration before deploying the reviewed code. Old code tolerates the additive schema; new code requires it. A code rollback can leave the new schema in place. Do not drop the ledger or use `db:push` as a production migration shortcut.
5. Check Production environment configuration: `PLAID_ENV=production`, `PLAID_CLIENT_ID`, Production `PLAID_SECRET`, stable `ENCRYPTION_KEY`, `PLAID_REDIRECT_URI`, `PLAID_WEBHOOK_URL`, authentication, `DATABASE_URL`, and `CRON_SECRET`. `NEXT_PUBLIC_PLAID_LINKING` is generated by `next.config.ts`; do not set it separately. Redeploy after environment changes.
6. Set `ADMIN_EMAILS=ntillmann1439@gmail.com`, `PLAID_PRODUCTION_ITEM_LIMIT=10`, and the correct `PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED` offset before enabling real links. All users begin disabled; open `/admin/brokerages` and enable Nick's account first. Confirm actual Plaid plan and total historical Item usage before increasing the cap.
7. Connect one owned brokerage account and compare balances, cash, quantities, and cost basis. Refresh twice, inspect sanitized logs/webhooks, exercise reconnect/disconnect, and validate observed deposits/withdrawals/transfers before widening access.

More detail and reproducible test commands are in `README.md` under Plaid sync regression tests and rollout.
