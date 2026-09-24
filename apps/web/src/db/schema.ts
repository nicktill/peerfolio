import {
  boolean,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

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
    /** Stable public identifier. Never the email. */
    handle: text("handle"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), uniqueIndex("users_handle_idx").on(t.handle)],
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
  /** Plaid `security_id`. */
  id: text("id").primaryKey(),
  tickerSymbol: text("ticker_symbol"),
  name: text("name"),
  type: text("type"),
  closePrice: numeric("close_price", { precision: 20, scale: 6 }),
  closePriceAsOf: date("close_price_as_of"),
  isoCurrencyCode: text("iso_currency_code").default("USD"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  (t) => [uniqueIndex("snapshots_user_date_idx").on(t.userId, t.date), index("snapshots_date_idx").on(t.date)],
)

/* ------------------------------------------------------------------ *
 * Relations
 * ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many }) => ({
  items: many(plaidItems),
  accounts: many(accounts),
  snapshots: many(portfolioSnapshots),
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
export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect
