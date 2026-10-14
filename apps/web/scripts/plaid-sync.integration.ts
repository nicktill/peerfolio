import assert from 'node:assert/strict'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { eq, sql } from 'drizzle-orm'
import type { PlaidLinkOnSuccessMetadata } from 'react-plaid-link'
import type { InvestmentFlow } from '../src/lib/plaid-sync-core'
import * as schema from '../src/db/schema'
import { db, users, plaidItems, accounts, holdings, portfolioSnapshots, plaidInvestmentFlows, accountEvents, securities } from '../src/db'
import { getBrokerageAccess, productionCapacity, reserveProductionLinkAttempt } from '../src/lib/plaid-access'
import { loadLivePoints } from '../src/lib/returns'
import { encrypt } from '../src/lib/crypto'
import { manualMutation } from '../src/lib/manual-mutation'
import { loadSharedHoldings } from '../src/lib/social'
import { requireManualAccount } from '../src/lib/positions'
import { DELETE as deleteAccount } from '../src/app/api/accounts/[id]/route'
import { revalueSecurities } from '../src/lib/positions'
import { timeWeightedReturn } from '../src/lib/ranges'
import { syncItem, investableTotal, writeDailySnapshot } from '../src/lib/plaid-sync'
import { replaceManualAccount, restoreManualAccount } from '../src/lib/account-replacement'
import { exchangePublicToken, pendingLinkToken } from '../src/lib/plaid-link'
import { DELETE as deleteProfile } from '../src/app/api/me/route'
import { DELETE as disconnect } from '../src/app/api/plaid/items/[id]/route'
import { GET as listAdminBrokerages, PATCH as updateBrokeragePermission } from '../src/app/api/admin/brokerages/route'
import { GET as brokerageAccess } from '../src/app/api/plaid/access/route'
import { POST as createLinkToken } from '../src/app/api/plaid/link-token/route'
import { POST as exchange } from '../src/app/api/plaid/exchange/route'

declare global {
  var plaidTestUser: string
  var plaidTestClient: unknown
  var plaidTestMutation: { url: string }
}

const connection = postgres(process.env.DATABASE_URL!, { max: 5, prepare: false, onnotice: () => {} })
const store = drizzle(connection, { schema })
;globalThis.__peerfolioDb = store
try {
  await migrate(store, { migrationsFolder: './drizzle' })
  // The launcher only permits the disposable local test database.
  await store.execute(sql`truncate table users, production_link_attempts cascade`)
  const [user] = await db.insert(users).values({ email: `plaid-test-${Date.now()}@example.com` }).returning()
  await db.update(users).set({ brokerageLinkingEnabled: true }).where(eq(users.id, user!.id))
  ;globalThis.plaidTestUser = user!.id
  const [adminUser] = await db.insert(users).values({ email: 'admin@test.peerfolio.invalid' }).returning()
  process.env.ADMIN_EMAILS = 'admin@test.peerfolio.invalid'
  const account = (id: string, value: number | null) => ({ account_id: id, name: id, type: 'investment', subtype: 'brokerage', balances: { current: value, iso_currency_code: accountCurrency } })
  let accountCurrency = 'USD'
  let extraAccount = false
  let balance: number | null = 1000
  let holdingList: Array<{ account_id: string; security_id: string; quantity: number; institution_value: number | null; cost_basis: number; iso_currency_code?: string }> = [{ account_id: 'a', security_id: 'stock', quantity: 10, institution_value: 1000, cost_basis: 1000, iso_currency_code: 'USD' }]
  let transactionList: InvestmentFlow[] = []
  let failure: string | null = null
  let empty = false
  let removed = 0
  let removeFailure = false
  let metadataFailure = false
  let revokeDuringMetadata = false
  let institutionMissing = false
  let holdingsAccountsMissing = false
  let holdingsBalance: number | null = null
  let transactionFailureOffset: number | null = null
  let linkRequests = 0
  let exchangeRequests = 0
  const client = {
    linkTokenCreate: async () => { linkRequests++; return { data: { link_token: 'mock-link', expiration: '2030-01-01' } } },
    accountsGet: async () => ({ data: { accounts: [...(empty ? [] : [account('a', balance)]), ...(extraAccount ? [account('b', 100)] : [])] } }),
    investmentsHoldingsGet: async () => {
      if (failure) throw { response: { data: { error_code: failure } } }
      return { data: { accounts: holdingsAccountsMissing ? [] : [...(empty ? [] : [account('a', holdingsBalance ?? balance)]), ...(extraAccount ? [account('b', 100)] : [])], holdings: holdingList, securities: [{ security_id: 'stock', name: 'Stock', type: 'equity', close_price: 100 }] } }
    },
    investmentsTransactionsGet: async ({ options }: { options: { offset: number } }) => {
      if (options.offset === transactionFailureOffset) throw { response: { data: { error_code: 'INVALID_REQUEST' } } }
      return { data: { investment_transactions: transactionList.slice(options.offset, options.offset + 500), total_investment_transactions: transactionList.length } }
    },
    itemPublicTokenExchange: async () => { exchangeRequests++; return { data: { access_token: 'duplicate-token', item_id: 'duplicate-item' } } },
    itemGet: async () => { if (revokeDuringMetadata) await db.update(users).set({ brokerageLinkingEnabled: false }).where(eq(users.id, user!.id)); if (metadataFailure) throw new Error('metadata outage'); return { data: { item: { institution_id: institutionMissing ? null : 'institution' } } } },
    institutionsGetById: async () => ({ data: { institution: { name: 'Test brokerage' } } }),
    itemRemove: async () => { if (removeFailure) throw { response: { data: { error_code: 'INTERNAL_SERVER_ERROR' } } }; removed++; return { data: {} } },
  }
  ;globalThis.plaidTestClient = client
  const [item] = await db.insert(plaidItems).values({ userId: user!.id, plaidItemId: 'test-item', institutionName: 'Test brokerage', institutionId: 'institution', accessToken: encrypt('fake-token') }).returning()
  // Non-admins cannot read the private user list or toggle their own permission.
  await assert.rejects(listAdminBrokerages(new Request('http://localhost/api/admin/brokerages'), {}), /Administrator/)
  await assert.rejects(updateBrokeragePermission(new Request('http://localhost/api/admin/brokerages', { method: 'PATCH', body: JSON.stringify({ userId: user!.id, allowed: true }) }), {}), /Administrator/)
  globalThis.plaidTestUser = adminUser!.id
  assert.equal((await listAdminBrokerages(new Request('http://localhost/api/admin/brokerages'), {})).status, 200)
  assert.equal((await updateBrokeragePermission(new Request('http://localhost/api/admin/brokerages', { method: 'PATCH', body: JSON.stringify({ userId: user!.id, allowed: false }) }), {})).status, 200)
  globalThis.plaidTestUser = user!.id
  assert.equal((await (await brokerageAccess(new Request('http://localhost/api/plaid/access'), {})).json()).allowed, false)
  // Eligibility is enforced on the server before either Plaid API is called.
  await db.update(users).set({ brokerageLinkingEnabled: false }).where(eq(users.id, user!.id))
  await assert.rejects(createLinkToken(new Request('http://localhost/api/plaid/link-token', { method: 'POST', body: '{}' }), {}))
  await assert.rejects(exchange(new Request('http://localhost/api/plaid/exchange', { method: 'POST', body: JSON.stringify({ publicToken: 'denied' }) }), {}))
  assert.equal(linkRequests, 0)
  assert.equal(exchangeRequests, 0)
  // Repairing an existing owned Item remains available when new linking is disabled.
  assert.equal((await createLinkToken(new Request('http://localhost/api/plaid/link-token', { method: 'POST', body: JSON.stringify({ itemId: item!.id }) }), {})).status, 200)
  globalThis.plaidTestUser = adminUser!.id
  await updateBrokeragePermission(new Request('http://localhost/api/admin/brokerages', { method: 'PATCH', body: JSON.stringify({ userId: user!.id, allowed: true }) }), {})
  globalThis.plaidTestUser = user!.id
  assert.equal((await (await brokerageAccess(new Request('http://localhost/api/plaid/access'), {})).json()).allowed, true)
  assert.equal((await createLinkToken(new Request('http://localhost/api/plaid/link-token', { method: 'POST', body: '{}' }), {})).status, 200)
  assert.equal((await syncItem(item!.id)).status, 'active')
  assert.equal((await db.select().from(holdings)).length, 1)
  // A sold position vanishes, including an account with no remaining holdings.
  holdingList = []
  await syncItem(item!.id)
  assert.equal((await db.select().from(holdings)).length, 0)
  // Restore then fail: stored balances and holdings must survive unchanged.
  holdingList = [{ account_id: 'a', security_id: 'stock', quantity: 10, institution_value: 1000, cost_basis: 1000, iso_currency_code: 'USD' }]
  await syncItem(item!.id)
  const before = await db.query.plaidItems.findFirst({ where: eq(plaidItems.id, item!.id) })
  balance = 9999
  failure = 'ITEM_LOGIN_REQUIRED'
  assert.equal((await syncItem(item!.id)).status, 'needs_reauth')
  const after = await db.query.plaidItems.findFirst({ where: eq(plaidItems.id, item!.id) })
  assert.equal(after!.lastSyncedAt!.getTime(), before!.lastSyncedAt!.getTime())
  assert.equal(Number((await db.select().from(accounts))[0]!.currentBalance), 1000)
  assert.equal((await db.select().from(holdings)).length, 1)
  failure = null
  // A same-day post-link deposit is neutralized through the baseline balance delta.
  const baselineFlows = Number((await db.select().from(portfolioSnapshots))[0]!.netFlows)
  balance = 1100
  transactionList = [{ investment_transaction_id: 'baseline-deposit', account_id: 'a', type: 'cash', subtype: 'deposit', amount: -100 }]
  assert.equal((await syncItem(item!.id)).status, 'active')
  assert.equal(Number((await db.select().from(portfolioSnapshots))[0]!.netFlows), baselineFlows + 100)
  await db.update(accounts).set({ plaidBaselineDate: '2000-01-01' }).where(eq(accounts.itemId, item!.id))
  balance = 1500
  transactionList = [{ investment_transaction_id: 'deposit', account_id: 'a', type: 'cash', subtype: 'deposit', amount: -500 }]
  // Concurrent cron/manual/webhook syncs must apply a deposit exactly once.
  const snapBefore = Number((await db.select().from(portfolioSnapshots))[0]!.netFlows)
  await Promise.all([syncItem(item!.id), syncItem(item!.id)])
  assert.equal(Number((await db.select().from(portfolioSnapshots))[0]!.netFlows), snapBefore + 500)
  assert.equal((await db.select().from(plaidInvestmentFlows)).length, 2)
  // Corrections apply only their delta; withdrawals remove cash, dividends remain performance.
  transactionList = [
    { investment_transaction_id: 'deposit', account_id: 'a', type: 'cash', subtype: 'deposit', amount: -600 },
    { investment_transaction_id: 'withdrawal', account_id: 'a', type: 'cash', subtype: 'withdrawal', amount: 100 },
    { investment_transaction_id: 'dividend', account_id: 'a', type: 'cash', subtype: 'dividend', amount: -20 },
  ]
  assert.equal((await syncItem(item!.id)).status, 'active')
  assert.equal(Number((await db.select().from(portfolioSnapshots))[0]!.netFlows), snapBefore + 500)
  // A failure on the second transaction page cannot partially import balances or flows.
  const persisted = await db.query.plaidItems.findFirst({ where: eq(plaidItems.id, item!.id) })
  const ledgerCount = (await db.select().from(plaidInvestmentFlows)).length
  transactionList = Array.from({ length: 501 }, (_, i) => ({ investment_transaction_id: `paged-${i}`, account_id: 'a', type: 'cash', subtype: 'deposit', amount: -1 }))
  transactionFailureOffset = 500
  balance = 8000
  assert.equal((await syncItem(item!.id)).status, 'error')
  assert.equal(Number((await db.select().from(accounts))[0]!.currentBalance), 1500)
  assert.equal((await db.select().from(plaidInvestmentFlows)).length, ledgerCount)
  assert.equal((await db.query.plaidItems.findFirst({ where: eq(plaidItems.id, item!.id) }))!.lastSyncedAt!.getTime(), persisted!.lastSyncedAt!.getTime())
  transactionFailureOffset = null
  transactionList = []
  // Incomplete Holdings account coverage must fail closed and preserve prior data.
  holdingsAccountsMissing = true
  assert.equal((await syncItem(item!.id)).status, 'error')
  assert.equal(Number((await db.select().from(accounts))[0]!.currentBalance), 1500)
  assert.equal((await db.select().from(holdings)).length, 1)
  holdingsAccountsMissing = false
  // Investments' authoritative balance wins over the older Accounts response.
  holdingsBalance = 1600
  assert.equal((await syncItem(item!.id)).status, 'active')
  assert.equal(Number((await db.select().from(accounts))[0]!.currentBalance), 1600)
  holdingsBalance = null
  balance = 1600
  balance = -200
  assert.equal((await syncItem(item!.id)).status, 'active')
  assert.equal((await loadLivePoints([user!.id])).get(user!.id)!.investableAssets, -200)
  assert.equal((await loadLivePoints([user!.id])).get(user!.id)!.netWorth, -200)
  balance = 1600
  await syncItem(item!.id)
  // A line we can't show (non-USD, no value, short) is left out; it never takes the connection down,
  // and the account balance (net worth) is unchanged.
  holdingList[0]!.iso_currency_code = 'EUR'
  assert.equal((await syncItem(item!.id)).status, 'active')
  assert.equal(Number((await db.select().from(accounts))[0]!.currentBalance), 1600)
  assert.equal((await db.select().from(holdings)).length, 0)
  holdingList[0]!.iso_currency_code = 'USD'
  holdingList[0]!.institution_value = null
  assert.equal((await syncItem(item!.id)).status, 'active')
  assert.equal((await db.select().from(holdings)).length, 0)
  holdingList[0]!.institution_value = -500
  assert.equal((await syncItem(item!.id)).status, 'active')
  assert.equal((await db.select().from(holdings)).length, 0)
  holdingList[0]!.institution_value = 1000
  assert.equal((await syncItem(item!.id)).status, 'active')
  assert.equal((await db.select().from(holdings)).length, 1)
  accountCurrency = 'EUR'
  assert.equal((await syncItem(item!.id)).status, 'error')
  assert.equal(Number((await db.select().from(accounts))[0]!.currentBalance), 1600)
  accountCurrency = 'USD'
  // Missing broker balance must never become a zero-valued portfolio.
  balance = null
  assert.equal((await syncItem(item!.id)).status, 'error')
  assert.equal(Number((await db.select().from(accounts))[0]!.currentBalance), 1600)
  balance = 1600
  // One successful Item does not verify another stale or failed institution.
  const [staleItem] = await db.insert(plaidItems).values({ userId: user!.id, plaidItemId: 'stale-item', institutionName: 'Stale brokerage', accessToken: encrypt('stale-token'), status: 'needs_reauth', lastSyncedAt: new Date('2000-01-01') }).returning()
  const [staleAccount] = await db.insert(accounts).values({ userId: user!.id, itemId: staleItem!.id, plaidAccountId: 'stale-account', name: 'Stale', type: 'investment', category: 'investment', currentBalance: '100', source: 'plaid' }).returning()
  transactionList = [{ investment_transaction_id: 'fresh-deposit', account_id: 'a', type: 'cash', subtype: 'deposit', amount: -1 }]
  await syncItem(item!.id)
  assert.equal((await db.select().from(portfolioSnapshots))[0]!.isVerified, false)
  assert.equal((await loadLivePoints([user!.id])).get(user!.id)!.isVerified, false)
  await db.delete(accounts).where(eq(accounts.id, staleAccount!.id))
  await db.delete(plaidItems).where(eq(plaidItems.id, staleItem!.id))
  // Resume the ordinary-day flow scenario after recovery-day neutralization.
  await db.update(accounts).set({ plaidBaselineDate: '2000-01-01' }).where(eq(accounts.itemId, item!.id))
  // A transaction removed from the complete window reverses its recorded cash flow.
  const flowsBeforeCancel = Number((await db.select().from(portfolioSnapshots))[0]!.netFlows)
  transactionList = [{ investment_transaction_id: 'canceled-deposit', account_id: 'a', type: 'cash', subtype: 'deposit', amount: -100, date: new Date().toISOString().slice(0, 10) }]
  balance = 1700
  await syncItem(item!.id)
  assert.equal(Number((await db.select().from(portfolioSnapshots))[0]!.netFlows), flowsBeforeCancel + 100)
  transactionList = []
  balance = 1600
  await syncItem(item!.id)
  assert.equal(Number((await db.select().from(portfolioSnapshots))[0]!.netFlows), flowsBeforeCancel)
  // A repeated new Link for the same institution is rejected and removed remotely.
  await assert.rejects(exchange(new Request('http://localhost/api/plaid/exchange', { method: 'POST', body: JSON.stringify({ publicToken: 'fake' }) }), {}), /already connected/)
  assert.equal(removed, 1)
  assert.equal((await db.select().from(plaidItems)).length, 1)
  metadataFailure = true
  await assert.rejects(exchange(new Request('http://localhost/api/plaid/exchange', { method: 'POST', body: JSON.stringify({ publicToken: 'fake' }) }), {}), /brokerage/)
  assert.equal(removed, 2)
  metadataFailure = false
  institutionMissing = true
  await assert.rejects(exchange(new Request('http://localhost/api/plaid/exchange', { method: 'POST', body: JSON.stringify({ publicToken: 'fake' }) }), {}), /brokerage/)
  assert.equal(removed, 3)
  institutionMissing = false
  const [otherUser] = await db.insert(users).values({ email: `plaid-other-${Date.now()}@example.com` }).returning()
  const [otherItem] = await db.insert(plaidItems).values({ userId: otherUser!.id, plaidItemId: 'other-item', institutionName: 'Other brokerage', accessToken: encrypt('other-token') }).returning()
  const originalExchange = client.itemPublicTokenExchange
  client.itemPublicTokenExchange = async () => ({ data: { access_token: 'other-token', item_id: otherItem!.plaidItemId } })
  await assert.rejects(exchange(new Request('http://localhost/api/plaid/exchange', { method: 'POST', body: JSON.stringify({ publicToken: 'fake' }) }), {}), /another account/)
  assert.equal(removed, 3, 'Must not remove another user’s stored Item')
  client.itemPublicTokenExchange = originalExchange
  await db.delete(users).where(eq(users.id, otherUser!.id))
  // Permission revoked after token exchange cannot commit a local connection.
  revokeDuringMetadata = true
  const removalsBeforeRevoke = removed
  await assert.rejects(exchange(new Request('http://localhost/api/plaid/exchange', { method: 'POST', body: JSON.stringify({ publicToken: 'revoked-mid-link' }) }), {}), /not been enabled/)
  assert.equal(removed, removalsBeforeRevoke + 1)
  assert.equal((await db.select().from(plaidItems)).length, 1)
  revokeDuringMetadata = false
  await db.update(users).set({ brokerageLinkingEnabled: true }).where(eq(users.id, user!.id))
  // Reconnect resumes the original Item, including across the OAuth return page.
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (k: string,v: string) => storage.set(k,v), getItem: (k: string) => storage.get(k) ?? null, removeItem: (k: string) => storage.delete(k) } })
  pendingLinkToken.save('link-token', item!.id)
  assert.equal(pendingLinkToken.itemId(), item!.id)
  await exchangePublicToken('', {} as PlaidLinkOnSuccessMetadata, pendingLinkToken.itemId())
  assert.equal(globalThis.plaidTestMutation.url, `/api/plaid/items/${item!.id}`)
  pendingLinkToken.clear()
  assert.equal(pendingLinkToken.load(), null)
  assert.equal(pendingLinkToken.itemId(), undefined)
  // Structural account removal and its withdrawal must count as one capital outflow.
  extraAccount = true
  await syncItem(item!.id)
  await db.update(accounts).set({ plaidBaselineDate: '2000-01-01' }).where(eq(accounts.itemId, item!.id))
  const beforeRemoval = Number((await db.select().from(portfolioSnapshots))[0]!.netFlows)
  empty = true
  holdingList = []
  transactionList = [{ investment_transaction_id: 'removed-withdrawal', account_id: 'a', type: 'cash', subtype: 'withdrawal', amount: 1600, date: new Date().toISOString().slice(0, 10) }]
  assert.equal((await syncItem(item!.id)).status, 'active')
  assert.equal(Number((await db.select().from(portfolioSnapshots))[0]!.netFlows), beforeRemoval - 1600)
  extraAccount = false
  // Sandbox is free of production quota; concurrent production exchanges reserve once.
  assert.equal(await reserveProductionLinkAttempt(user!.id, 'sandbox-attempt'), null)
  assert.equal((await productionCapacity()).used, 0)
  process.env.PLAID_ENV = 'production'
  // Paid keys remain set, but absent Trial keys must block new connections.
  const callsBeforeMissingTrial = exchangeRequests
  await assert.rejects(exchange(new Request('http://localhost/api/plaid/exchange', { method: 'POST', body: JSON.stringify({ publicToken: 'missing-trial' }) }), {}), /coming soon/)
  assert.equal(exchangeRequests, callsBeforeMissingTrial)
  process.env.PLAID_TRIAL_CLIENT_ID = 'trial-test'
  process.env.PLAID_TRIAL_SECRET = 'trial-test-secret'

  process.env.PLAID_PRODUCTION_ITEM_LIMIT = '1'
  process.env.PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED = '0'
  const callsBeforeCap = exchangeRequests
  await Promise.allSettled(['cap-one', 'cap-two'].map((publicToken) => exchange(new Request('http://localhost/api/plaid/exchange', { method: 'POST', body: JSON.stringify({ publicToken }) }), {})))
  assert.equal(exchangeRequests, callsBeforeCap + 1)
  assert.equal((await productionCapacity()).used, 1)
  assert.equal((await getBrokerageAccess(user!.id)).allowed, false)
  // Trial-only mode cannot call the paid team even to repair a legacy Item.
  const repairsBeforePaidBlock = linkRequests
  await assert.rejects(createLinkToken(new Request('http://localhost/api/plaid/link-token', { method: 'POST', body: JSON.stringify({ itemId: item!.id }) }), {}), /Paid Plaid credentials are disabled/)
  assert.equal(linkRequests, repairsBeforePaidBlock)
  // Explicit paid mode restores legacy repair even when capacity is exhausted.
  process.env.PLAID_CONNECTION_PROFILE = 'paid'
  assert.equal((await createLinkToken(new Request('http://localhost/api/plaid/link-token', { method: 'POST', body: JSON.stringify({ itemId: item!.id }) }), {})).status, 200)
  process.env.PLAID_ENV = 'sandbox'
  delete process.env.PLAID_CONNECTION_PROFILE
  // Closed/revoked accounts stop contributing and lose their holdings.
  empty = true
  await syncItem(item!.id)
  assert.equal((await db.select().from(accounts))[0]!.isActive, false)
  assert.equal((await db.select().from(holdings)).length, 0)
  removeFailure = true
  await assert.rejects(deleteProfile(new Request('http://localhost/api/me', { method: 'DELETE' }), {}), /account was preserved/)
  assert.ok(await db.query.users.findFirst({ where: eq(users.id, user!.id) }))
  await assert.rejects(disconnect(new Request('http://localhost/api/plaid/items/test', { method: 'DELETE' }), { params: Promise.resolve({ id: item!.id }) }), /connection was preserved/)
  assert.equal((await db.select().from(plaidItems)).length, 1)
  removeFailure = false
  assert.equal((await disconnect(new Request('http://localhost/api/plaid/items/test', { method: 'DELETE' }), { params: Promise.resolve({ id: item!.id }) })).status, 200)
  assert.equal((await db.select().from(plaidItems)).length, 0)
  assert.equal((await db.select().from(accounts)).length, 0)
  assert.equal((await db.select().from(plaidInvestmentFlows)).length, 0)
  assert.equal((await productionCapacity()).used, 1, 'Disconnect must not replenish lifetime capacity')
  await db.delete(users).where(eq(users.id, user!.id))
  assert.equal((await productionCapacity()).used, 1, 'Account deletion must not replenish lifetime capacity')
  await db.insert(users).values({ email: 'denied@test.peerfolio.invalid' })
  // Explicit manual-to-linked replacement: no Plaid request or new Item is required.
  const [replacementUser] = await db.insert(users).values({ email: 'replacement@test.peerfolio.invalid' }).returning()
  const [replacementItem] = await db.insert(plaidItems).values({ userId: replacementUser!.id, plaidItemId: 'replacement-item', institutionName: 'Replacement brokerage', accessToken: encrypt('replacement-test-token'), lastSyncedAt: new Date() }).returning()
  const [manualReplacement] = await db.insert(accounts).values({ userId: replacementUser!.id, name: 'Manual IRA', source: 'manual', category: 'investment', currentBalance: '1000' }).returning()
  const [linkedReplacement] = await db.insert(accounts).values({ userId: replacementUser!.id, itemId: replacementItem!.id, plaidAccountId: 'replacement-account', name: 'Linked IRA', source: 'plaid', category: 'investment', currentBalance: '1100' }).returning()
  await db.insert(securities).values([{ id: 'replacement-stock', name: 'Demo stock', tickerSymbol: 'BKUP' }, { id: 'linked-stock', name: 'Linked stock', tickerSymbol: 'LIVE' }])
  await db.insert(holdings).values({ userId: replacementUser!.id, accountId: linkedReplacement!.id, securityId: 'linked-stock', quantity: '1', institutionValue: '1100' })
  await db.insert(holdings).values({ userId: replacementUser!.id, accountId: manualReplacement!.id, securityId: 'replacement-stock', quantity: '10', institutionValue: '1000' })
  await db.insert(portfolioSnapshots).values({ userId: replacementUser!.id, date: '2000-01-01', totalAssets: '1000', totalLiabilities: '0', netWorth: '1000', investableAssets: '1000', netFlows: '0', isVerified: false })
  await writeDailySnapshot(replacementUser!.id, 1100)
  const originalHistory = await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, replacementUser!.id))
  const yesterday = originalHistory.find((r) => r.date === '2000-01-01')!
  await assert.rejects(replaceManualAccount(adminUser!.id, manualReplacement!.id, linkedReplacement!.id), /not found/)
  await assert.rejects(replaceManualAccount(replacementUser!.id, manualReplacement!.id, manualReplacement!.id), /different/)
  await db.update(plaidItems).set({ status: 'needs_reauth' }).where(eq(plaidItems.id, replacementItem!.id))
  await assert.rejects(replaceManualAccount(replacementUser!.id, manualReplacement!.id, linkedReplacement!.id), /Refresh/)
  await db.update(plaidItems).set({ status: 'active' }).where(eq(plaidItems.id, replacementItem!.id))
  // A failure after snapshot correction must roll back both correction and archive.
  await store.execute(sql`create function fail_replacement_event() returns trigger language plpgsql as $$ begin if NEW.action = 'account_replaced' then raise exception 'replacement audit unavailable'; end if; return NEW; end $$`)
  await store.execute(sql`create trigger fail_replacement before insert on account_events for each row execute function fail_replacement_event()`)
  try {
    await assert.rejects(replaceManualAccount(replacementUser!.id, manualReplacement!.id, linkedReplacement!.id), (error: unknown) => {
      const failure = error as { message?: string; cause?: { message?: string } }
      return String(failure.cause?.message ?? failure.message).includes('replacement audit unavailable')
    })
    assert.equal((await db.query.accounts.findFirst({ where: eq(accounts.id, manualReplacement!.id) }))!.isActive, true)
    assert.equal(await investableTotal(replacementUser!.id), 2100)
    assert.deepEqual(await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, replacementUser!.id)), originalHistory)
  } finally {
    await store.execute(sql`drop trigger fail_replacement on account_events`)
    await store.execute(sql`drop function fail_replacement_event()`)
  }
  const exchangesBeforeReplacement = exchangeRequests
  const duplicateReplacement = await Promise.allSettled([replaceManualAccount(replacementUser!.id, manualReplacement!.id, linkedReplacement!.id), replaceManualAccount(replacementUser!.id, manualReplacement!.id, linkedReplacement!.id)])
  assert.equal(duplicateReplacement.filter((r) => r.status === 'fulfilled').length, 1)
  assert.deepEqual((await loadSharedHoldings([replacementUser!.id])).get(replacementUser!.id), [{ ticker: 'LIVE', name: 'Linked stock', weight: 100 }], 'Archived holdings must not leak to leagues, board or public profiles')
  assert.equal(exchangeRequests, exchangesBeforeReplacement)
  assert.equal(await investableTotal(replacementUser!.id), 1100)
  assert.equal((await db.query.accounts.findFirst({ where: eq(accounts.id, manualReplacement!.id) }))!.isActive, false)
  assert.equal((await db.select().from(holdings).where(eq(holdings.accountId, manualReplacement!.id))).length, 1, 'Archived manual holdings are retained')
  const historyAfter = await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, replacementUser!.id))
  assert.deepEqual(historyAfter.find((r) => r.date === '2000-01-01'), yesterday)
  const correctedToday = historyAfter.find((r) => r.date !== '2000-01-01')!
  assert.equal(Number(correctedToday.investableAssets), 1100)
  assert.equal(Number(correctedToday.netFlows), 100, 'Removing duplicate capital is neutralized as a correction')
  const audit = await db.query.accountEvents.findFirst({ where: eq(accountEvents.userId, replacementUser!.id) })
  assert.equal(audit!.action, 'account_replaced')
  assert.equal(audit!.detail.linkedAccountId, linkedReplacement!.id)
  await assert.rejects(replaceManualAccount(replacementUser!.id, manualReplacement!.id, linkedReplacement!.id), /active manual/)
  const [secondManual] = await db.insert(accounts).values({ userId: replacementUser!.id, name: 'Other IRA', source: 'manual', category: 'investment', currentBalance: '500' }).returning()
  await writeDailySnapshot(replacementUser!.id, Number(secondManual!.currentBalance))
  await assert.rejects(replaceManualAccount(replacementUser!.id, secondManual!.id, linkedReplacement!.id), /already replaced/)
  // Archived backups must be frozen even when their shared security is repriced.
  await db.update(securities).set({ marketTicker: 'ARCHIVE_TEST', closePrice: '200', closePriceAsOf: new Date().toISOString().slice(0, 10), closePriceFinal: true }).where(eq(securities.id, 'replacement-stock'))
  await revalueSecurities(['replacement-stock'])
  assert.equal(Number((await db.query.holdings.findFirst({ where: eq(holdings.accountId, manualReplacement!.id) }))!.institutionValue), 1000)
  assert.equal(Number((await db.query.accounts.findFirst({ where: eq(accounts.id, manualReplacement!.id) }))!.currentBalance), 1000)
  await assert.rejects(restoreManualAccount(adminUser!.id, manualReplacement!.id), /not found/)
  await assert.rejects(restoreManualAccount(replacementUser!.id, manualReplacement!.id), /Remove the linked/)
  // Removing the linked counterpart permits restoration without creating a new Item.
  await db.delete(accounts).where(eq(accounts.id, linkedReplacement!.id))
  await writeDailySnapshot(replacementUser!.id, -1100)
  const [relinked] = await db.insert(accounts).values({ userId: replacementUser!.id, itemId: replacementItem!.id, plaidAccountId: 'relinked-different-id', name: 'Relinked IRA', source: 'plaid', category: 'investment', currentBalance: '1100' }).returning()
  await assert.rejects(restoreManualAccount(replacementUser!.id, manualReplacement!.id), /Remove linked investment/)
  await db.delete(accounts).where(eq(accounts.id, relinked!.id))
  await db.update(securities).set({ closePriceAsOf: '2000-01-01' }).where(eq(securities.id, 'replacement-stock'))
  await assert.rejects(restoreManualAccount(replacementUser!.id, manualReplacement!.id), /Current prices/)
  await db.update(securities).set({ closePriceAsOf: new Date().toISOString().slice(0, 10) }).where(eq(securities.id, 'replacement-stock'))
  await restoreManualAccount(replacementUser!.id, manualReplacement!.id)
  assert.equal((await db.query.accounts.findFirst({ where: eq(accounts.id, manualReplacement!.id) }))!.isActive, true)
  assert.equal(Number((await db.query.holdings.findFirst({ where: eq(holdings.accountId, manualReplacement!.id) }))!.institutionValue), 2000)
  assert.equal(Number((await db.query.accounts.findFirst({ where: eq(accounts.id, manualReplacement!.id) }))!.currentBalance), 2000)
  assert.deepEqual(await db.query.portfolioSnapshots.findFirst({ where: sql`${portfolioSnapshots.userId} = ${replacementUser!.id} AND ${portfolioSnapshots.date} = '2000-01-01'` }), yesterday)
  await assert.rejects(restoreManualAccount(replacementUser!.id, manualReplacement!.id), /archived manual/)
  assert.equal(exchangeRequests, exchangesBeforeReplacement)
  // A 100-value reconciliation is capital correction, not a ten-percent league gain.
  const corrected = timeWeightedReturn([{ date: '2026-01-01', netWorth: 1000, investableAssets: 1000, netFlows: 0, isVerified: false }, { date: '2026-01-02', netWorth: 1100, investableAssets: 1100, netFlows: 100, isVerified: false }, { date: '2026-01-03', netWorth: 1111, investableAssets: 1111, netFlows: 0, isVerified: false }])
  assert.ok(Math.abs(corrected.percent - 1) < 0.0001, 'Only the next day market gain counts')

  assert.equal((await db.query.accounts.findFirst({ where: eq(accounts.id, secondManual!.id) }))!.isActive, true)
  // Reauthentication must preserve genuine outage gains/losses, not erase them.
  const [repairUser] = await db.insert(users).values({ email: 'repair-baseline@test.peerfolio.invalid' }).returning()
  const [repairItem] = await db.insert(plaidItems).values({ userId: repairUser!.id, plaidItemId: 'repair-baseline', institutionName: 'Demo', accessToken: encrypt('repair-token'), flowsInitialized: true, status: 'needs_reauth', lastSyncedAt: new Date('2000-01-01') }).returning()
  await db.insert(accounts).values({ userId: repairUser!.id, itemId: repairItem!.id, plaidAccountId: 'a', source: 'plaid', name: 'Demo account', category: 'investment', currentBalance: '1000', plaidBaselineDate: '2000-01-01' })
  await writeDailySnapshot(repairUser!.id, 0, '2000-01-01')
  empty = false; extraAccount = false; balance = 850; holdingsBalance = null; holdingsAccountsMissing = false; holdingList = []; transactionList = []; failure = null; transactionFailureOffset = null
  assert.equal((await syncItem(repairItem!.id)).status, 'active')
  const recoveryDay = new Date().toISOString().slice(0, 10)
  const repairSnapshot = await db.query.portfolioSnapshots.findFirst({ where: sql`${portfolioSnapshots.userId} = ${repairUser!.id} AND ${portfolioSnapshots.date} = ${recoveryDay}` })
  assert.equal(Number(repairSnapshot!.investableAssets), 850)
  assert.equal(Number(repairSnapshot!.netFlows), 0, 'A real outage loss is not neutral capital')
  const ActualDate = globalThis.Date
  const nextDayTime = Date.now() + 86400000
  class NextDay extends ActualDate { constructor(value?: string | number | Date) { super(value === undefined ? nextDayTime : value instanceof ActualDate ? value.getTime() : value) } static now() { return nextDayTime } }
  try {
    globalThis.Date = NextDay as DateConstructor
    // Next-day sync appends normal market performance to the preserved loss.
    balance = 858.5
    assert.equal((await syncItem(repairItem!.id)).status, 'active')
    const rows = await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, repairUser!.id)).orderBy(portfolioSnapshots.date)
    const result = timeWeightedReturn(rows.map((r) => ({ date: r.date, netWorth: Number(r.netWorth), investableAssets: Number(r.investableAssets), netFlows: Number(r.netFlows), isVerified: r.isVerified })))
    assert.ok(Math.abs(result.percent - (-14.15)) < 0.0001)
    // Restored backup was already repriced and fully booked as capital yesterday.
    await revalueSecurities(['replacement-stock'])
    await writeDailySnapshot(replacementUser!.id)
    const restoredRows = await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, replacementUser!.id)).orderBy(portfolioSnapshots.date)
    const restoredReturn = timeWeightedReturn(restoredRows.map((r) => ({ date: r.date, netWorth: Number(r.netWorth), investableAssets: Number(r.investableAssets), netFlows: Number(r.netFlows), isVerified: r.isVerified })))
    assert.ok(Math.abs(restoredReturn.percent) < 0.0001, 'Next-day repricing must not create a stale-price restoration gain')
  } finally { globalThis.Date = ActualDate }

  // A manual edit holds the same lock: replacement waits and snapshots its final balance.
  const [raceManual] = await db.insert(accounts).values({ userId: replacementUser!.id, name: 'Race manual', source: 'manual', category: 'investment', currentBalance: '300' }).returning()
  const [raceLinked] = await db.insert(accounts).values({ userId: replacementUser!.id, itemId: replacementItem!.id, plaidAccountId: 'race-linked', name: 'Race linked', source: 'plaid', category: 'investment', currentBalance: '400' }).returning()
  await writeDailySnapshot(replacementUser!.id, 700)
  let releaseEdit!: () => void
  let editStarted!: () => void
  const started = new Promise<void>((resolve) => { editStarted = resolve })
  const release = new Promise<void>((resolve) => { releaseEdit = resolve })
  const edit = manualMutation(replacementUser!.id, async (tx) => {
    await requireManualAccount(replacementUser!.id, raceManual!.id, tx)
    editStarted(); await release
    const beforeEdit = await investableTotal(replacementUser!.id, tx)
    await tx.update(accounts).set({ currentBalance: '350' }).where(eq(accounts.id, raceManual!.id))
    await writeDailySnapshot(replacementUser!.id, (await investableTotal(replacementUser!.id, tx)) - beforeEdit, undefined, tx)
  })
  await started
  const replacement = replaceManualAccount(replacementUser!.id, raceManual!.id, raceLinked!.id)
  releaseEdit(); await Promise.all([edit, replacement])
  assert.equal(Number((await db.query.accounts.findFirst({ where: eq(accounts.id, raceManual!.id) }))!.currentBalance), 350)
  await assert.rejects(manualMutation(replacementUser!.id, (tx) => requireManualAccount(replacementUser!.id, raceManual!.id, tx)), /archived/)
  // Discarding an archived backup changes neither totals nor snapshots.
  globalThis.plaidTestUser = replacementUser!.id
  const beforeDiscard = await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, replacementUser!.id))
  const totalBeforeDiscard = await investableTotal(replacementUser!.id)
  assert.equal((await deleteAccount(new Request('http://localhost/api/accounts/manual', { method: 'DELETE' }), { params: Promise.resolve({ id: raceManual!.id }) })).status, 200)
  assert.equal(await investableTotal(replacementUser!.id), totalBeforeDiscard)
  assert.deepEqual(await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, replacementUser!.id)), beforeDiscard)
  console.log('Plaid integration regressions passed: migration, sold/empty holdings, rollback/timestamps, transaction pagination failure, baseline-day neutralization, flow corrections/withdrawals/dividends/cancellations, concurrent deduplication, complete Holdings coverage, authoritative balances, null balance rejection, signed investment equity, stale verification, duplicate/ownership/metadata cleanup, OAuth state, closed accounts, disconnect/profile-delete retry and cascades, denied server access, admin authorization/toggles, revoked-during-link cleanup, sandbox quota exemption, concurrent permanent production cap, repairs at capacity.')
} finally { await connection.end() }
