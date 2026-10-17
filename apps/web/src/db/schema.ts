import {
  bigint,
  bigserial,
  check,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { relations, sql } from "drizzle-orm"

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

/** Lifecycle of a Plaid Item. `needs_reauth` drives the re-connect banner. */
export const itemStatus = pgEnum("item_status", ["active", "needs_reauth", "error", "disconnected"])

/**
 * How an account rolls up. `liability` balances are subtracted from net worth;
 * only `investment` balances count toward league returns.
 */
export const accountCategory = pgEnum("account_category", ["investment", "cash", "credit", "loan", "other"])

/**
 * Where an account's numbers come from. `plaid` balances are pulled from the
 * institution; `manual` balances are typed in by the person.
 *
 * This distinction is load-bearing: manual portfolios can compete in private
 * leagues, but only `plaid` accounts make a user eligible for the public
 * board, so nothing self-reported is ever ranked publicly.
 */
export const accountSource = pgEnum("account_source", ["plaid", "manual"])

export const memberRole = pgEnum("member_role", ["owner", "member"])

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    image: text("image"),
    /** Public identifier inside leagues and on the board. Never the email. */
    handle: text("handle"),
    bio: text("bio"),
    /**
     * Opt in to the public board. Off by default — a verified return is only
     * publishable because the person deliberately published it.
     */
    isPublic: boolean("is_public").notNull().default(false),
    brokerageLinkingEnabled: boolean("brokerage_linking_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_handle_idx").on(t.handle),
    // Public profiles are a small minority of rows; partial keeps it tiny.
    index("users_public_idx").on(t.id).where(sql`${t.isPublic}`),
  ],
)

export const waitlistSignups = pgTable(
  "waitlist_signups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    note: text("note"),
    /** Which surface the signup came from, e.g. "hero" or "waitlist_page". */
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("waitlist_email_idx").on(t.email)],
)

/* ------------------------------------------------------------------ *
 * Plaid
 * ------------------------------------------------------------------ */

/** Lifetime production exchange attempts survive disconnects and account deletion. */
export const productionLinkAttempts = pgTable("production_link_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Deliberately no FK: deleting a user must never replenish the production budget.
  userId: uuid("user_id").notNull(),
  publicTokenDigest: text("public_token_digest").notNull(),
  status: text("status").notNull().default("reserved"),
  plaidItemId: text("plaid_item_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [uniqueIndex("production_link_attempts_token_idx").on(t.publicTokenDigest)])

export const plaidItems = pgTable(
  "plaid_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plaidItemId: text("plaid_item_id").notNull(),
    /**
     * AES-256-GCM ciphertext, never the raw token. Decrypted only inside
     * server-side Plaid calls — this column must never reach a client payload.
     */
    accessToken: text("access_token").notNull(),
    institutionId: text("institution_id"),
    institutionName: text("institution_name").notNull(),
    institutionLogo: text("institution_logo"),
    status: itemStatus("status").notNull().default("active"),
    /** Last Plaid error code, e.g. ITEM_LOGIN_REQUIRED. */
    errorCode: text("error_code"),
    transactionsCursor: text("transactions_cursor"),
    flowsInitialized: boolean("flows_initialized").notNull().default(false),
    consentExpiresAt: timestamp("consent_expires_at", { withTimezone: true }),
    /** Last successful complete financial import; errors never advance it. */
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plaid_items_item_id_idx").on(t.plaidItemId), index("plaid_items_user_idx").on(t.userId)],
)

/** Transactions already incorporated into returns. Baseline activity predates tracking. */
export const plaidInvestmentFlows = pgTable("plaid_investment_flows", {
  transactionId: text("transaction_id").primaryKey(),
  itemId: uuid("item_id").notNull().references(() => plaidItems.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 20, scale: 4 }).notNull(),
  baseline: boolean("baseline").notNull().default(false),
  transactionDate: date("transaction_date"),
  /** Plaid account identifier; scopes flow reconciliation to still-connected accounts. */
  accountId: text("account_id").notNull(),
}, (t) => [index("plaid_investment_flows_item_idx").on(t.itemId)])

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null for manual accounts, which have no Plaid Item behind them. */
    itemId: uuid("item_id").references(() => plaidItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: accountSource("source").notNull().default("plaid"),
    /** Null for manual accounts. */
    plaidAccountId: text("plaid_account_id"),
    /** Manual accounts only: shown in place of an institution logo. */
    institutionLabel: text("institution_label"),
    name: text("name").notNull(),
    officialName: text("official_name"),
    mask: text("mask"),
    type: text("type"),
    subtype: text("subtype"),
    category: accountCategory("category").notNull().default("other"),
    currentBalance: numeric("current_balance", { precision: 20, scale: 4 }),
    availableBalance: numeric("available_balance", { precision: 20, scale: 4 }),
    isoCurrencyCode: text("iso_currency_code").default("USD"),
    isActive: boolean("is_active").notNull().default(true),
    /** First import/reactivation day is capital baseline, not measured performance. */
    plaidBaselineDate: date("plaid_baseline_date"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("accounts_plaid_id_idx").on(t.plaidAccountId),
    index("accounts_source_idx").on(t.userId, t.source),
    index("accounts_user_idx").on(t.userId),
    index("accounts_item_idx").on(t.itemId),
  ],
)

export const securities = pgTable("securities", {
  /** Plaid `security_id`, or `mkt:<marketTicker>` for positions entered by hand. */
  id: text("id").primaryKey(),
  tickerSymbol: text("ticker_symbol"),
  name: text("name"),
  type: text("type"),
  closePrice: numeric("close_price", { precision: 20, scale: 6 }),
  closePriceAsOf: date("close_price_as_of"),
  /**
   * Whether `closePrice` is the official close for `closePriceAsOf`. A live
   * price taken during the session is not: the first catch-up after the close
   * replaces it with the real one (see `staleHeldSecurities`).
   */
  closePriceFinal: boolean("close_price_final").notNull().default(true),
  /**
   * The close before `closePrice`, kept when a newer price arrives. It is what
   * "today's change" is measured against; null until a second price has been seen.
   */
  previousClose: numeric("previous_close", { precision: 20, scale: 6 }),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  /**
   * Symbol at our market data provider, e.g. `AAPL` or `X:BTCUSD`. Set means
   * we price this security ourselves each night; Plaid securities leave it
   * null because the institution already reports their value.
   */
  marketTicker: text("market_ticker"),
  /**
   * When a price was last written to this row, by any source (a trigger sets it
   * on every write to `close_price` or `close_price_as_of`). Unlike `updated_at`,
   * which is also bumped when a refresh is only attempted, this is the last time
   * a price actually arrived. Null for rows priced before it existed.
   */
  pricedAt: timestamp("priced_at", { withTimezone: true }),
  // Reserved for retry scheduling; currently unused (columns exist in production via migration 0021).
  closeAttempts: smallint("close_attempts").notNull().default(0),
  closeAttemptSession: date("close_attempt_session"),
  unsupportedBy: text("unsupported_by").array(),
  /** Metadata retries are independent of price freshness. */
  metadataCheckedAt: timestamp("metadata_checked_at", { withTimezone: true }),
  /** Display sector (see lib/ai/sectors.ts) from the provider's company profile; null until known, and for funds, crypto and cash. */
  sector: text("sector"),
  /** The provider's own industry string, kept so the sector mapping can be improved without refetching. */
  industry: text("industry"),
  /** When a sector lookup last ran, hit or miss, so a ticker with no profile isn't retried on every request. */
  sectorCheckedAt: timestamp("sector_checked_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/**
 * One row per price provider: a token bucket shared by every server, so all of
 * them together stay inside the provider's allowance (see lib/provider-budget.ts).
 */
/** Small operator switches that must change without a deploy (see lib/plaid-switch.ts). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
})

export const providerBudgets = pgTable("provider_budgets", {
  provider: text("provider").primaryKey(),
  tokens: doublePrecision("tokens").notNull(),
  refilledAt: timestamp("refilled_at", { withTimezone: true }).notNull().defaultNow(),
  /** Set from a provider's 429: no server asks it anything before then. */
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  /** Whether the latest request for a token got one (an UPDATE can't return the row it replaced). */
  lastGranted: boolean("last_granted").notNull().default(true),
})

/**
 * Provider request counters, one row per provider per minute (see lib/provider-stats.ts).
 * `requests` are those sent; `denied` are those our budget refused; `rateLimited`
 * and `failed` are sent requests the provider answered with 429 or an error.
 */
export const providerRequestStats = pgTable(
  "provider_request_stats",
  {
    provider: text("provider").notNull(),
    minute: timestamp("minute", { withTimezone: true }).notNull(),
    requests: integer("requests").notNull().default(0),
    symbols: integer("symbols").notNull().default(0),
    denied: integer("denied").notNull().default(0),
    rateLimited: integer("rate_limited").notNull().default(0),
    failed: integer("failed").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.provider, t.minute] }), index("provider_request_stats_minute_idx").on(t.minute)],
)

/**
 * One row per provider request that did not succeed, kept 14 days: the "why and when"
 * behind the counters above. Public market data only (a path without its query, a few
 * tickers, a short reason); never a key, header or token. Written best effort and capped
 * per provider per minute, so an outage can't flood it.
 */
export const providerRequestEvents = pgTable(
  "provider_request_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    provider: text("provider").notNull(),
    /** denied (our budget refused it), rate_limited (provider 429), failed (error answer or thrown), timeout. */
    kind: text("kind").notNull(),
    httpStatus: integer("http_status"),
    endpoint: text("endpoint").notNull(),
    symbolsCount: integer("symbols_count").notNull().default(0),
    symbolsSample: text("symbols_sample").notNull().default(""),
    reason: text("reason").notNull().default(""),
    waitSeconds: integer("wait_seconds"),
    caller: text("caller"),
    suppressed: integer("suppressed").notNull().default(0),
  },
  (t) => [index("provider_request_events_at_idx").on(t.at), index("provider_request_events_provider_kind_at_idx").on(t.provider, t.kind, t.at)],
)

/**
 * One row per sync attempt, kept 30 days so a bad link can be diagnosed after the runtime
 * logs are gone. Counts and codes only: never tokens, balances, tickers or holding contents.
 */
export const plaidSyncRuns = pgTable(
  "plaid_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** cron, webhook, manual (refresh button) or link (first sync after linking). */
    trigger: text("trigger").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    /** ok, partial (saved, but positions missing or still loading) or failed. */
    status: text("status").notNull(),
    errorCode: text("error_code"),
    requestId: text("request_id"),
    accountsReceived: integer("accounts_received").notNull().default(0),
    holdingsReceived: integer("holdings_received").notNull().default(0),
    holdingsKept: integer("holdings_kept").notNull().default(0),
    holdingsSkipped: jsonb("holdings_skipped").notNull().default({}),
    /** Lines whose own currency was missing and taken from the (USD) account. */
    currencyAssumed: integer("currency_assumed").notNull().default(0),
    securitiesMissingTicker: integer("securities_missing_ticker").notNull().default(0),
    /** An investment account had a balance but no position lines at all. */
    balanceWithoutHoldings: boolean("balance_without_holdings").notNull().default(false),
  },
  (t) => [index("plaid_sync_runs_started_idx").on(t.startedAt), index("plaid_sync_runs_item_idx").on(t.itemId, t.startedAt)],
)

export const holdings = pgTable(
  "holdings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    securityId: text("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),
    quantity: numeric("quantity", { precision: 24, scale: 8 }),
    costBasis: numeric("cost_basis", { precision: 20, scale: 4 }),
    institutionValue: numeric("institution_value", { precision: 20, scale: 4 }),
    isoCurrencyCode: text("iso_currency_code").default("USD"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("holdings_account_security_idx").on(t.accountId, t.securityId),
    index("holdings_user_idx").on(t.userId),
  ],
)

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

/**
 * One row per user per day. Plaid exposes no portfolio history, so this table
 * *is* the history — it only ever grows forward from the day someone connects.
 *
 * `netFlows` records deposits minus withdrawals for the day so returns can be
 * time-weighted: without it, whoever contributes the most cash looks like the
 * best investor.
 */
export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    totalAssets: numeric("total_assets", { precision: 20, scale: 4 }).notNull(),
    totalLiabilities: numeric("total_liabilities", { precision: 20, scale: 4 }).notNull(),
    netWorth: numeric("net_worth", { precision: 20, scale: 4 }).notNull(),
    /** Investment accounts only — the basis for league scoring. */
    investableAssets: numeric("investable_assets", { precision: 20, scale: 4 }).notNull(),
    netFlows: numeric("net_flows", { precision: 20, scale: 4 }).notNull().default("0"),
    /**
     * True when every account contributing to this point was Plaid-backed.
     * Recorded per day so a user who connects later doesn't retroactively
     * make their self-reported history look verified.
     */
    isVerified: boolean("is_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("snapshots_user_date_idx").on(t.userId, t.date),
    index("snapshots_date_idx").on(t.date),
  ],
)

/**
 * Append-only record of changes people make to their own manual accounts: an
 * account added, edited or removed, a position set, imported or removed.
 *
 * Snapshots only keep a day's final value and its net flow, so without this a
 * balance that drops to zero can't be explained after the fact. `accountId` has
 * no foreign key on purpose: the history must outlive a deleted account.
 */
export const accountEvents = pgTable(
  "account_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id"),
    accountName: text("account_name"),
    /** account_created, account_updated, account_deleted, position_set, positions_imported, position_removed */
    action: text("action").notNull(),
    /** Investable total across all accounts just before and just after the change. */
    investableBefore: numeric("investable_before", { precision: 20, scale: 4 }).notNull(),
    investableAfter: numeric("investable_after", { precision: 20, scale: 4 }).notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_events_user_idx").on(t.userId, t.createdAt)],
)

/* ------------------------------------------------------------------ *
 * Leagues — the social layer
 * ------------------------------------------------------------------ */

export const leagues = pgTable(
  "leagues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    emoji: text("emoji").notNull().default("🏆"),
    /** Token from the accent list in the league UI, not a raw hex value. */
    accent: text("accent").notNull().default("emerald"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteCode: text("invite_code").notNull(),
    memberLimit: integer("member_limit").notNull().default(25),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("leagues_invite_code_idx").on(t.inviteCode), index("leagues_owner_idx").on(t.ownerId)],
)

export const leagueMembers = pgTable(
  "league_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    /** Opt in to showing top tickers to this league. Values are never shared. */
    shareHoldings: boolean("share_holdings").notNull().default(true),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("league_members_unique_idx").on(t.leagueId, t.userId),
    index("league_members_user_idx").on(t.userId),
  ],
)

/** Lightweight cheering on a member's standing. One emoji per pair per league. */
export const reactions = pgTable(
  "reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reactions_unique_idx").on(t.leagueId, t.fromUserId, t.toUserId, t.emoji),
    index("reactions_league_target_idx").on(t.leagueId, t.toUserId),
  ],
)

/**
 * Following someone on the public board. Asymmetric by design: this is
 * discovery, not friendship — mutual consent lives in leagues instead.
 */
export const follows = pgTable(
  "follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followingId: uuid("following_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("follows_unique_idx").on(t.followerId, t.followingId),
    index("follows_following_idx").on(t.followingId),
  ],
)

/* ------------------------------------------------------------------ *
 * Fantasy leagues — paper money, picked stocks
 *
 * Kept apart from `leagues` on purpose: nothing here ever touches real
 * holdings or snapshots, so play money can't leak into a real return and a
 * real balance can't leak into a fantasy one.
 * ------------------------------------------------------------------ */

export const tradeSide = pgEnum("trade_side", ["buy", "sell"])

export const fantasyLeagues = pgTable(
  "fantasy_leagues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default("🏈"),
    accent: text("accent").notNull().default("emerald"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteCode: text("invite_code").notNull(),
    /** Everyone starts with exactly this much play cash. */
    startingCash: numeric("starting_cash", { precision: 20, scale: 2 }).notNull().default("100000"),
    /** No single ticker may exceed this share of a member's portfolio after a buy. Null means no cap. */
    maxPositionPct: integer("max_position_pct"),
    /** Null runs forever. After it passes, trading stops and standings freeze. */
    endsAt: timestamp("ends_at", { withTimezone: true }),
    memberLimit: integer("member_limit").notNull().default(50),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fantasy_leagues_invite_code_idx").on(t.inviteCode),
    index("fantasy_leagues_owner_idx").on(t.ownerId),
  ],
)

export const fantasyMembers = pgTable(
  "fantasy_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => fantasyLeagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Uninvested play cash. Changed only inside a locked trade transaction. */
    cash: numeric("cash", { precision: 20, scale: 6 }).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fantasy_members_unique_idx").on(t.leagueId, t.userId),
    index("fantasy_members_user_idx").on(t.userId),
  ],
)

/** Lightweight cheering on fantasy standings. Membership ids keep reactions league-scoped. */
export const fantasyReactions = pgTable(
  "fantasy_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromMemberId: uuid("from_member_id")
      .notNull()
      .references(() => fantasyMembers.id, { onDelete: "cascade" }),
    toMemberId: uuid("to_member_id")
      .notNull()
      .references(() => fantasyMembers.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fantasy_reactions_unique_idx").on(t.fromMemberId, t.toMemberId, t.emoji),
    index("fantasy_reactions_target_idx").on(t.toMemberId),
  ],
)

/** Current holdings per member. Priced from `securities`, like manual positions. */
export const fantasyPositions = pgTable(
  "fantasy_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => fantasyMembers.id, { onDelete: "cascade" }),
    securityId: text("security_id")
      .notNull()
      .references(() => securities.id),
    shares: numeric("shares", { precision: 24, scale: 8 }).notNull(),
    /** Total paid for the shares still held, for the per-position gain. */
    costBasis: numeric("cost_basis", { precision: 20, scale: 6 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fantasy_positions_unique_idx").on(t.memberId, t.securityId)],
)

/** Append-only trade log. Also the league's activity feed. */
export const fantasyTrades = pgTable(
  "fantasy_trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => fantasyLeagues.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => fantasyMembers.id, { onDelete: "cascade" }),
    securityId: text("security_id")
      .notNull()
      .references(() => securities.id),
    side: tradeSide("side").notNull(),
    shares: numeric("shares", { precision: 24, scale: 8 }).notNull(),
    price: numeric("price", { precision: 20, scale: 6 }).notNull(),
    priceAsOf: date("price_as_of").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fantasy_trades_league_created_idx").on(t.leagueId, t.createdAt)],
)

export const orderStatus = pgEnum("order_status", ["pending", "filled", "cancelled", "rejected"])

/**
 * Stock orders placed while the market is closed. The only price on file then
 * is the last close, which extended-hours trading has already moved away from,
 * so the order waits and fills at the first live price after the open.
 * A pending buy's `amount` is set aside from the member's cash until it settles.
 */
export const fantasyOrders = pgTable(
  "fantasy_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => fantasyLeagues.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => fantasyMembers.id, { onDelete: "cascade" }),
    securityId: text("security_id")
      .notNull()
      .references(() => securities.id),
    side: tradeSide("side").notNull(),
    /** Dollars to spend, for a buy. */
    amount: numeric("amount", { precision: 20, scale: 2 }),
    /** Shares to sell. Null on a sell means everything held at the open. */
    shares: numeric("shares", { precision: 24, scale: 8 }),
    status: orderStatus("status").notNull().default("pending"),
    /** Why it didn't fill, when rejected or cancelled by the system. */
    reason: text("reason"),
    tradeId: uuid("trade_id").references(() => fantasyTrades.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [
    index("fantasy_orders_status_created_idx").on(t.status, t.createdAt),
    index("fantasy_orders_member_idx").on(t.memberId, t.status),
  ],
)

/** One value per member per day, written by the nightly job, for the race chart. */
export const fantasySnapshots = pgTable(
  "fantasy_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => fantasyMembers.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    value: numeric("value", { precision: 20, scale: 6 }).notNull(),
  },
  (t) => [uniqueIndex("fantasy_snapshots_member_date_idx").on(t.memberId, t.date)],
)

/* ------------------------------------------------------------------ *
 * Fantasy seasons, rounds, drafts, recaps and notes
 *
 * Additive. A league with no season row is given an open-ended trading season
 * the first time anyone loads it (see lib/fantasy-seasons.ts). Rounds are
 * scored on percentages and ranks only; nothing here stores a balance.
 * ------------------------------------------------------------------ */

/** A run of weekly rounds. `mode` is "trading" or "draft"; `status` is "active" or "complete". */
export const fantasySeasons = pgTable(
  "fantasy_seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => fantasyLeagues.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    mode: text("mode").notNull().default("trading"),
    status: text("status").notNull().default("active"),
    /** Null runs until the owner wraps it up. */
    roundCount: integer("round_count"),
    /** Draft seasons only: how many stocks each player picks. */
    picksPerRound: integer("picks_per_round"),
    /** "weekly" (the default, and every season before this column), "monthly" or "quarterly". Trading seasons only. */
    cadence: text("cadence").notNull().default("weekly"),
    /** A period boundary at 00:00 UTC (a Monday, the 1st, or a quarter's first day, by cadence). Round n starts n-1 periods later. */
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fantasy_seasons_league_number_idx").on(t.leagueId, t.number)],
)

/** One week of a season. `status` is "open", "locked" (draft picks frozen) or "settled" (results written). */
export const fantasyRounds = pgTable(
  "fantasy_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => fantasySeasons.id, { onDelete: "cascade" }),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => fantasyLeagues.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("open"),
    /** Settled on whatever data existed once the grace period ran out. */
    late: boolean("late").notNull().default(false),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fantasy_rounds_season_number_idx").on(t.seasonId, t.number), index("fantasy_rounds_league_idx").on(t.leagueId, t.status)],
)

/** Frozen result of a settled round, per player. Percent only. */
export const fantasyRoundResults = pgTable(
  "fantasy_round_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => fantasyRounds.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => fantasyMembers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    returnPct: numeric("return_pct", { precision: 14, scale: 4 }).notNull(),
    /** Worst pick of the round (draft), the tie-break. */
    floorPct: numeric("floor_pct", { precision: 14, scale: 4 }),
    rank: integer("rank").notNull(),
    points: numeric("points", { precision: 8, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex("fantasy_round_results_unique_idx").on(t.roundId, t.memberId), index("fantasy_round_results_user_idx").on(t.userId)],
)

/** A player's stock for a draft round. Entry is captured at the lock, exit at settlement. */
export const fantasyDraftPicks = pgTable(
  "fantasy_draft_picks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => fantasyRounds.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => fantasyMembers.id, { onDelete: "cascade" }),
    securityId: text("security_id")
      .notNull()
      .references(() => securities.id),
    slot: integer("slot").notNull(),
    entryPrice: numeric("entry_price", { precision: 20, scale: 6 }),
    entryAsOf: date("entry_as_of"),
    exitPrice: numeric("exit_price", { precision: 20, scale: 6 }),
    exitAsOf: date("exit_as_of"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fantasy_draft_picks_unique_idx").on(t.roundId, t.memberId, t.securityId),
    uniqueIndex("fantasy_draft_picks_slot_idx").on(t.roundId, t.memberId, t.slot),
    index("fantasy_draft_picks_round_idx").on(t.roundId),
  ],
)

/** Badges. `roundNumber` is 0 for season-level ones. */
export const fantasyTrophies = pgTable(
  "fantasy_trophies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => fantasyLeagues.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => fantasySeasons.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    roundNumber: integer("round_number").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fantasy_trophies_unique_idx").on(t.seasonId, t.userId, t.kind, t.roundNumber), index("fantasy_trophies_user_idx").on(t.userId)],
)

/** The generated weekly recap. `shareToken` unlocks the public, percentage-only image. */
export const fantasyRecaps = pgTable(
  "fantasy_recaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => fantasyRounds.id, { onDelete: "cascade" }),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => fantasyLeagues.id, { onDelete: "cascade" }),
    shareToken: text("share_token").notNull(),
    /** False once the owner stops sharing: the public page and image then answer 404, and the token is replaced. */
    sharing: boolean("sharing").notNull().default(true),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fantasy_recaps_round_idx").on(t.roundId), uniqueIndex("fantasy_recaps_token_idx").on(t.shareToken)],
)

/**
 * Notification-ready records: one row per thing worth telling someone about.
 * Nothing sends them yet; a push or email worker reads rows with a null
 * `deliveredAt`. `userId` null means the whole league. `dedupeKey` makes writes idempotent.
 */
export const fantasyEvents = pgTable(
  "fantasy_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => fantasyLeagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("fantasy_events_dedupe_idx").on(t.dedupeKey), index("fantasy_events_user_idx").on(t.userId, t.createdAt)],
)

/** "Why I picked this": a short note on a trade, a queued order or a draft pick. */
export const fantasyNotes = pgTable(
  "fantasy_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => fantasyLeagues.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => fantasyMembers.id, { onDelete: "cascade" }),
    tradeId: uuid("trade_id").references(() => fantasyTrades.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => fantasyOrders.id, { onDelete: "cascade" }),
    pickId: uuid("pick_id").references(() => fantasyDraftPicks.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fantasy_notes_trade_idx").on(t.tradeId),
    uniqueIndex("fantasy_notes_order_idx").on(t.orderId),
    uniqueIndex("fantasy_notes_pick_idx").on(t.pickId),
    index("fantasy_notes_league_idx").on(t.leagueId, t.createdAt),
  ],
)

export const fantasyNoteReplies = pgTable(
  "fantasy_note_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => fantasyNotes.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => fantasyMembers.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fantasy_note_replies_note_idx").on(t.noteId, t.createdAt)],
)

/** Same emoji set as standings reactions, pointed at a note. */
export const fantasyNoteReactions = pgTable(
  "fantasy_note_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => fantasyNotes.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => fantasyMembers.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fantasy_note_reactions_unique_idx").on(t.noteId, t.memberId, t.emoji)],
)

/* ------------------------------------------------------------------ *
 * Relations
 * ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many }) => ({
  items: many(plaidItems),
  accounts: many(accounts),
  snapshots: many(portfolioSnapshots),
  memberships: many(leagueMembers),
  followers: many(follows),
}))

export const plaidItemsRelations = relations(plaidItems, ({ one, many }) => ({
  user: one(users, { fields: [plaidItems.userId], references: [users.id] }),
  accounts: many(accounts),
}))

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  item: one(plaidItems, { fields: [accounts.itemId], references: [plaidItems.id] }),
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  holdings: many(holdings),
}))

export const holdingsRelations = relations(holdings, ({ one }) => ({
  account: one(accounts, { fields: [holdings.accountId], references: [accounts.id] }),
  security: one(securities, { fields: [holdings.securityId], references: [securities.id] }),
}))

export type User = typeof users.$inferSelect
export type PlaidItem = typeof plaidItems.$inferSelect
export type Account = typeof accounts.$inferSelect
export type Holding = typeof holdings.$inferSelect
export type Security = typeof securities.$inferSelect
export const leaguesRelations = relations(leagues, ({ one, many }) => ({
  owner: one(users, { fields: [leagues.ownerId], references: [users.id] }),
  members: many(leagueMembers),
}))

export const leagueMembersRelations = relations(leagueMembers, ({ one }) => ({
  league: one(leagues, { fields: [leagueMembers.leagueId], references: [leagues.id] }),
  user: one(users, { fields: [leagueMembers.userId], references: [users.id] }),
}))

export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect
export type League = typeof leagues.$inferSelect
export type LeagueMember = typeof leagueMembers.$inferSelect
export type Follow = typeof follows.$inferSelect
export type FantasyLeague = typeof fantasyLeagues.$inferSelect
export type FantasyMember = typeof fantasyMembers.$inferSelect

/* ------------------------------------------------------------------ *
 * News
 * ------------------------------------------------------------------ */

/** Headlines from publishers' RSS feeds: title, summary, time and link only, never the article. */
export const newsItems = pgTable(
  "news_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    summary: text("summary"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("news_items_url_idx").on(t.url), index("news_items_published_idx").on(t.publishedAt)],
)

/**
 * One published recap per period: the day's after the close, the week's after
 * its last session. `sources` keeps what each cited id pointed to, so the page
 * can link them without the items table. `fallback` marks a headline-only recap
 * written without the model; `costUsd` is the spend ledger the monthly cap reads.
 */
export const newsBriefs = pgTable(
  "news_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    period: text("period").notNull(),
    periodEnd: date("period_end").notNull(),
    headline: text("headline").notNull(),
    body: text("body").notNull(),
    takeaways: jsonb("takeaways").notNull(),
    sources: jsonb("sources").notNull(),
    model: text("model"),
    fallback: boolean("fallback").notNull().default(false),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("news_briefs_period_idx").on(t.period, t.periodEnd)],
)

/**
 * Every AI attempt the news job makes, append-only: the worst case is reserved
 * before the call and `costUsd` filled in after. The monthly cap reads this,
 * not the published recaps, so overlapping runs and rewrites are all counted.
 */
export const newsAiSpend = pgTable(
  "news_ai_spend",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    period: text("period").notNull(),
    periodEnd: date("period_end").notNull(),
    reservedUsd: numeric("reserved_usd", { precision: 10, scale: 6 }).notNull(),
    /** Null until the attempt settles; until then the reservation counts. */
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("news_ai_spend_created_idx").on(t.createdAt)],
)

/* ------------------------------------------------------------------ *
 * Assistant
 * ------------------------------------------------------------------ */

/**
 * Every assistant request, append-only: the worst case is reserved before the
 * model is called and `costUsd` filled in after, as with `news_ai_spend`. The
 * per-user limits and the monthly cap both read this table. No message text is
 * stored here, only counts and cost.
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    reservedUsd: numeric("reserved_usd", { precision: 10, scale: 6 }).notNull(),
    /** Null until the request settles; until then the reservation counts. */
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_user_created_idx").on(t.userId, t.createdAt), index("ai_usage_created_idx").on(t.createdAt)],
)

/* ------------------------------------------------------------------ *
 * Benchmarks
 * ------------------------------------------------------------------ */

/**
 * Daily split-adjusted closes for the comparison ETFs (SPY, QQQ, VTI). A handful of
 * symbols, one row per trading day, fetched once and then read from here, so charting
 * a benchmark never costs a provider call per viewer. Price returns: dividends aren't added back.
 */
export const benchmarkPrices = pgTable(
  "benchmark_prices",
  {
    symbol: text("symbol").notNull(),
    date: date("date").notNull(),
    close: numeric("close", { precision: 20, scale: 6 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.date] })],
)

export type NewsItem = typeof newsItems.$inferSelect
export type NewsBrief = typeof newsBriefs.$inferSelect

/* ------------------------------------------------------------------ *
 * Sports picks (feature flag `sportsEnabled`)
 *
 * A second league type with virtual credits only. Fully separate from the
 * fantasy stock tables: nothing here references fantasy_* or real holdings.
 * Events, markets and lines are GLOBAL (one published line serves every
 * league); only members, picks and the ledger are per league.
 * Lines are immutable once published; picks snapshot the accepted price.
 * ------------------------------------------------------------------ */

export const sportsLeagues = pgTable(
  "sports_leagues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default("🏈"),
    accent: text("accent").notNull().default("emerald"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteCode: text("invite_code").notNull(),
    /** Which sports picks are offered, e.g. ["nfl","nba"]. */
    sports: jsonb("sports").$type<string[]>().notNull(),
    /** Virtual credits every member starts with. Fixed at creation. */
    startingCredits: integer("starting_credits").notNull().default(1000),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    memberLimit: integer("member_limit").notNull().default(50),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sports_leagues_invite_code_idx").on(t.inviteCode), index("sports_leagues_owner_idx").on(t.ownerId)],
)

export const sportsMembers = pgTable(
  "sports_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => sportsLeagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Spendable credits. Changed only together with a ledger row, under a row lock. */
    credits: integer("credits").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sports_members_unique_idx").on(t.leagueId, t.userId),
    index("sports_members_user_idx").on(t.userId),
    check("sports_members_credits_nonneg", sql`${t.credits} >= 0`),
  ],
)

export const sportsEvents = pgTable(
  "sports_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sport: text("sport").notNull(),
    /** The odds provider's id for the game. */
    externalId: text("external_id").notNull(),
    homeName: text("home_name").notNull(),
    awayName: text("away_name").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    /** scheduled | postponed | cancelled | final | void */
    status: text("status").notNull().default("scheduled"),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    /** When a settlement source first reported a final. Starts the settle delay. */
    finalFirstSeenAt: timestamp("final_first_seen_at", { withTimezone: true }),
    /** Other vendors' ids for this game, by source name, learned when a results source matched it by name and time. */
    aliases: jsonb("aliases").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sports_events_external_idx").on(t.sport, t.externalId), index("sports_events_starts_idx").on(t.startsAt)],
)

export const sportsMarkets = pgTable(
  "sports_markets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => sportsEvents.id, { onDelete: "cascade" }),
    /** `${key}|${player}`, unique per event. */
    marketKey: text("market_key").notNull(),
    kind: text("kind").notNull(),
    player: text("player"),
    statKey: text("stat_key"),
    /** open | locked | settled | void */
    status: text("status").notNull().default("open"),
    lockAt: timestamp("lock_at", { withTimezone: true }).notNull(),
    booksUsed: integer("books_used").notNull(),
    voidReason: text("void_reason"),
    /** Consensus at publish time, to notice when the true line has moved. */
    fairProbA: doublePrecision("fair_prob_a"),
    pointA: doublePrecision("point_a"),
    /** Why a market was closed to new picks before its lock time (line moved, start moved earlier). */
    frozenReason: text("frozen_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sports_markets_event_key_idx").on(t.eventId, t.marketKey), index("sports_markets_status_idx").on(t.status, t.lockAt)],
)

/** Immutable. A price change is a new market (after a void), never an UPDATE. */
export const sportsLines = pgTable(
  "sports_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => sportsMarkets.id, { onDelete: "cascade" }),
    selection: text("selection").notNull(),
    /** American odds. */
    price: integer("price").notNull(),
    point: doublePrecision("point"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sports_lines_market_sel_idx").on(t.marketId, t.selection)],
)

export const sportsPicks = pgTable(
  "sports_picks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => sportsLeagues.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => sportsMembers.id, { onDelete: "cascade" }),
    marketId: uuid("market_id")
      .notNull()
      .references(() => sportsMarkets.id),
    lineId: uuid("line_id")
      .notNull()
      .references(() => sportsLines.id),
    selection: text("selection").notNull(),
    stake: integer("stake").notNull(),
    /** Snapshot of the accepted line. */
    price: integer("price").notNull(),
    point: doublePrecision("point"),
    /** Stake included, fixed at acceptance. */
    totalReturn: integer("total_return").notNull(),
    /** open | won | lost | push | void */
    status: text("status").notNull().default("open"),
    /** Client-supplied idempotency key so a double submit places one pick. */
    requestId: text("request_id").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("sports_picks_member_market_idx").on(t.memberId, t.marketId),
    uniqueIndex("sports_picks_request_idx").on(t.memberId, t.requestId),
    index("sports_picks_market_idx").on(t.marketId, t.status),
    check("sports_picks_stake_pos", sql`${t.stake} > 0`),
  ],
)

/** Append-only credit ledger. A member's credits equal the sum of their rows. */
export const sportsLedger = pgTable(
  "sports_ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => sportsMembers.id, { onDelete: "cascade" }),
    pickId: uuid("pick_id").references(() => sportsPicks.id),
    /** grant | place | settle_win | settle_refund */
    type: text("type").notNull(),
    /** Signed credits. */
    amount: integer("amount").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sports_ledger_key_idx").on(t.idempotencyKey), index("sports_ledger_member_idx").on(t.memberId)],
)

/** Odds-provider credits spent per UTC day (see lib/sports/credit-budget.ts). */
export const sportsProviderUsage = pgTable(
  "sports_provider_usage",
  {
    provider: text("provider").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    credits: integer("credits").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.provider, t.day] })],
)

/** Outbox for "your pick settled" messages: recorded now, delivered by push or email later. */
export const sportsNotifications = pgTable(
  "sports_notifications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    pickId: uuid("pick_id").references(() => sportsPicks.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("sports_notifications_pick_kind_idx").on(t.pickId, t.kind), index("sports_notifications_pending_idx").on(t.deliveredAt)],
)

/** Fixed-window request counters shared by every server (join, pick, create). Old windows are pruned by the publish cron. */
export const sportsRateLimits = pgTable(
  "sports_rate_limits",
  {
    key: text("key").notNull(),
    bucket: bigint("bucket", { mode: "number" }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.bucket] })],
)

/* ------------------------------------------------------------------ *
 * Live in-game odds (display only; see lib/sports/live)
 *
 * Written by the standalone live-odds worker, read by /api/sports/live/[gameId]. Deliberately separate from
 * picks, lines, markets and settlement: nothing here is read when a pick is accepted, priced or graded, so an
 * exchange quote can never change a payout or a result.
 * ------------------------------------------------------------------ */

/** One observation of one side of one market from one source. Probabilities are 0..1. Pruned by lib/sports/live/retention. */
export const liveQuote = pgTable(
  "live_quote",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => sportsEvents.id, { onDelete: "cascade" }),
    /** "moneyline" for now. */
    market: text("market").notNull(),
    /** home | away */
    selection: text("selection").notNull(),
    /** polymarket | kalshi | espn */
    source: text("source").notNull(),
    bid: doublePrecision("bid"),
    ask: doublePrecision("ask"),
    /** Midpoint of a two-sided book (or a model's single number); null when the book was one-sided or crossed. */
    mid: doublePrecision("mid"),
    /** When the source says the book was true; null when it does not say. */
    sourceTs: timestamp("source_ts", { withTimezone: true }),
    fetchedTs: timestamp("fetched_ts", { withTimezone: true }).notNull(),
  },
  (t) => [
    // Latest per key (DISTINCT ON ... ORDER BY fetched_ts DESC) and the per-event read.
    index("live_quote_key_idx").on(t.eventId, t.market, t.selection, t.source, t.fetchedTs.desc()),
    // Retention sweeps by age.
    index("live_quote_fetched_idx").on(t.fetchedTs),
  ],
)

/** Latest score/period/clock per game: one row, overwritten each poll. */
export const liveState = pgTable("live_state", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => sportsEvents.id, { onDelete: "cascade" }),
  /** pre | live | final | unknown, as the live feed reports it. Informational: settlement never reads it. */
  status: text("status").notNull(),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  period: text("period"),
  clock: text("clock"),
  source: text("source").notNull(),
  sourceTs: timestamp("source_ts", { withTimezone: true }),
  fetchedTs: timestamp("fetched_ts", { withTimezone: true }).notNull(),
})
