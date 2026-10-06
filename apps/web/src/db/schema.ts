import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
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
    consentExpiresAt: timestamp("consent_expires_at", { withTimezone: true }),
    flowBaselineDate: date("flow_baseline_date"),
    flowsNeedBaseline: boolean("flows_need_baseline").notNull().default(false),
    flowCheckedThrough: date("flow_checked_through"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plaid_items_item_id_idx").on(t.plaidItemId), index("plaid_items_user_idx").on(t.userId)],
)

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
  quotePrintedAt: timestamp("quote_printed_at", { withTimezone: true }),
  priceAcceptedAt: timestamp("price_accepted_at", { withTimezone: true }),
  previousClose: numeric("previous_close", { precision: 20, scale: 6 }),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  /**
   * Symbol at our market data provider, e.g. `AAPL` or `X:BTCUSD`. Set means
   * we price this security ourselves each night; Plaid securities leave it
   * null because the institution already reports their value.
   */
  marketTicker: text("market_ticker"),
  /** Metadata retries are independent of price freshness. */
  metadataCheckedAt: timestamp("metadata_checked_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/**
 * One row per price provider: a token bucket shared by every server, so all of
 * them together stay inside the provider's allowance (see lib/provider-budget.ts).
 */
export const providerBudgets = pgTable("provider_budgets", {
  provider: text("provider").primaryKey(),
  tokens: doublePrecision("tokens").notNull(),
  refilledAt: timestamp("refilled_at", { withTimezone: true }).notNull().defaultNow(),
  /** Set from a provider's 429: no server asks it anything before then. */
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  /** Whether the latest request for a token got one (an UPDATE can't return the row it replaced). */
  lastGranted: boolean("last_granted").notNull().default(true),
})

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

export type NewsItem = typeof newsItems.$inferSelect
export type NewsBrief = typeof newsBriefs.$inferSelect

/** External events are deduplicated independently of additive manual flows. */
export const portfolioFlowEvents = pgTable("portfolio_flow_events", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 20, scale: 4 }).notNull(),
  transactionDate: date("transaction_date").notNull(),
  appliedDate: date("applied_date").notNull(),
}, t => [index("portfolio_flow_events_user_idx").on(t.userId, t.appliedDate)])

/** Legacy snapshots establish a cutover; old flows must not be applied again. */
export const portfolioFlowBaselines = pgTable("portfolio_flow_baselines", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
})

export const importAiSpend = pgTable("import_ai_spend", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  reservedUsd: numeric("reserved_usd", { precision: 10, scale: 6 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("import_ai_spend_created_idx").on(t.createdAt), index("import_ai_spend_user_created_idx").on(t.userId, t.createdAt)])

/** No user FK: removal must survive deletion of the user. Only encrypted
 * tokens remain temporarily; a successful remote removal erases the row. */
export const plaidRemovals = pgTable("plaid_removals", {
  id: text("id").primaryKey(), accessToken: text("access_token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const snapshotSteps = pgTable("snapshot_steps", {
  date: date("date").notNull(), step: text("step").notNull(),
  status: text("status").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("snapshot_steps_date_step_idx").on(t.date, t.step)])

export const backgroundLeases = pgTable("background_leases", {
  name: text("name").primaryKey(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
})
