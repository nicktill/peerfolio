# Plaid Trial beta rollout

Trial is a billing plan on Plaid's production API, not a Sandbox environment.
The existing per-user admin permission and global pause switch remain mandatory.
Deploying this change does not enable any user.

## Vercel configuration

Keep `PLAID_CLIENT_ID` and `PLAID_SECRET` unchanged for legacy paid Items.
Set `PLAID_ENV=production`, `PLAID_CONNECTION_PROFILE=trial`,
`PLAID_TRIAL_CLIENT_ID`, and the secret `PLAID_TRIAL_SECRET` on the intended deployment.
A second free Trial team (another 10 Items) can be added with `PLAID_TRIAL_CLIENT_ID_2` and `PLAID_TRIAL_SECRET_2`
(optional `PLAID_TRIAL_ITEM_LIMIT_2`, capped at 10, and `PLAID_TRIAL_ITEMS_PREVIOUSLY_USED_2`). New connections use the
first team until its 10 are used, then the second, but only when `PLAID_TRIAL_2_ENABLED=1` (exactly `1`); credentials alone never route a connection to it. Never unset the second pair while Items linked to it exist.
Trial fails closed if either Trial credential is missing, or its client ID matches the paid team.
There is no fallback to the paid team. While Trial mode is active, all paid-client calls are blocked, including legacy sync/repair/removal; disable Trial mode explicitly before managing any pre-existing paid Items. Never paste secrets into issue descriptions or logs.

In the Trial team's Plaid dashboard, confirm Investments access and register the deployed
`PLAID_REDIRECT_URI` and `PLAID_WEBHOOK_URL`. The same HTTPS app URLs may be registered
on both teams. Confirm these existing variables match the actual deployed endpoints.

## Single-user real test (owner action)

1. Deploy the reviewed PR and confirm all automated checks pass.
2. Keep brokerage linking disabled for all other users. Check existing enabled users before testing;
   the app does not automatically revoke existing permissions during this rollout.
3. In the current admin panel, enable only the intended beta account. The permission is generic;
   it does not contain Trial-specific settings.
4. Sign in as that account and link one supported investment institution. This consumes a real Trial
   Item; repeated linking and disconnecting do not restore the ten lifetime slots.
5. Confirm holdings/balances import, refresh succeeds, and the Trial dashboard increments from 0/10.
   Verify the paid team's Item count does not change. Do not log or export raw access tokens.
6. Disable that account's new-link permission after testing if desired; existing Items can still sync
   and be disconnected. No Investments Refresh calls are added by this PR.

The existing lifetime connection reservation budget remains conservative and defaults to ten.
Older reservations can reduce available Trial capacity; do not reset the ledger to recover slots.
The Trial dashboard remains authoritative for Items created outside this app.

## Later switch to paid

Set `PLAID_CONNECTION_PROFILE=paid` and redeploy to send *new* connections to the original
paid team. Existing connections retain their profile inside the encrypted access-token envelope.
Legacy untagged tokens remain tagged as paid but cannot be called while Trial mode is active; Trial tokens stay Trial for sync, repair, and removal.
Keep both credential pairs. Switching keys alone cannot migrate an Item between Plaid teams.
No database migration is required. After creating Trial Items, rollbacks must retain the envelope
reader; versions predating this PR cannot read tagged tokens.
