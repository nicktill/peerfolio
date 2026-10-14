# Manual-to-linked account replacement

After linking and a successful import, use **Replace a manual account** in Your accounts.
Select the manual entry and the linked investment account, compare their institution/name,
mask, balances, and holding counts, and confirm they represent the same account.
Names do not automatically establish a match. Different balances are shown for review.

Replacement archives the manual account (`is_active=false`) and retains its holdings and
account-event history. The linked balance and holdings are the authoritative active entry;
manual quantities and costs are not added to the linked holdings. Existing portfolio snapshots
before today remain unchanged. Today's duplicate-capital removal is recorded as a structural
cash-flow correction, not investment loss. Historical self-reported days are not relabeled as
verified, and provider history is not fabricated or backfilled.

The operation is transactional, serialized with Plaid sync, requires both accounts to belong
to the signed-in user, and rejects inactive accounts, incomplete imports, mismatched currencies,
and a linked target that already replaced another manual entry. Repeated requests cannot remove
capital twice. No new Plaid Item, token exchange, or paid API call is made.

No production accounts are replaced automatically. The feature does not transfer a Plaid Item
between users. Archive restoration is not exposed in this first version.
