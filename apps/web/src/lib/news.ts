import "server-only"
import OpenAI from "openai"
import { and, desc, eq, gte, lt, sql } from "drizzle-orm"
import { db } from "@web/db"
import { newsAiSpend, newsBriefs, newsItems } from "@web/db/schema"
import { randomUUID } from "node:crypto"
import { regularSession } from "@web/lib/market-hours"
import { nyMinutes, canPublishDaily, type NewsSlot } from "@web/lib/news-schedule"
import { updateNewsMarket } from "@web/lib/news-market-store"
import type { MarketBoard } from "@web/lib/news-market"
import { fetchFeeds } from "@web/lib/news-feeds"
import { briefTargets, briefWindow, NEWS_MODEL, selectItems, writeBrief, type BriefPeriod, type SpendLedger } from "@web/lib/news-brief"

/** Most the recaps may spend in a calendar month (UTC). Past it, recaps are written from headlines only. */
const configuredBudget = Number(process.env.NEWS_AI_MONTHLY_BUDGET_USD ?? "1")
const MONTHLY_BUDGET_USD = Number.isFinite(configuredBudget) && configuredBudget >= 0 ? configuredBudget : 0
/** Headlines older than this are pruned; the weekly recap needs the last seven days. */
const KEEP_DAYS = 21
/** Any constant works; it only has to be the same for every server taking the budget lock. */
const BUDGET_LOCK = 4_207_001

const DAY = 86_400_000

function client() {
  const apiKey = process.env.OPENAI_API_KEY
  // One attempt of at most forty seconds per call: writeBrief does its own single retry, and two recaps
  // (day + week) of two attempts each must fit inside the route's 300-second limit.
  return apiKey ? new OpenAI({ apiKey, maxRetries: 0, timeout: 40_000 }) : null
}

/**
 * The monthly budget, metered per attempt. A reservation is taken under a
 * transaction-scoped advisory lock, so two runs at once can't both read the
 * same total and overspend; an unsettled reservation counts at its full amount.
 */
function ledgerFor(period: BriefPeriod, periodEnd: string, now: Date): SpendLedger {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return {
    reserve: (usd) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${BUDGET_LOCK})`)
        const [row] = await tx
          .select({ total: sql<string>`coalesce(sum(coalesce(${newsAiSpend.costUsd}, ${newsAiSpend.reservedUsd})), 0)` })
          .from(newsAiSpend)
          .where(gte(newsAiSpend.createdAt, monthStart))
        if (Number(row?.total ?? 0) + usd > MONTHLY_BUDGET_USD) return null
        const [entry] = await tx.insert(newsAiSpend).values({ period, periodEnd, reservedUsd: usd.toFixed(6) }).returning({ id: newsAiSpend.id })
        return entry?.id ?? null
      }),
    settle: async (id, actual) => {
      await db
        .update(newsAiSpend)
        .set({ costUsd: actual.costUsd.toFixed(6), inputTokens: actual.inputTokens, outputTokens: actual.outputTokens })
        .where(eq(newsAiSpend.id, id))
    },
  }
}

async function publish(period: BriefPeriod, periodEnd: string, now: Date, board: MarketBoard | null = null, morning = false, deadline = Infinity) {
  const { from, to } = briefWindow(period, periodEnd, now)
  const stored = await db
    .select()
    .from(newsItems)
    .where(and(gte(newsItems.publishedAt, from), lt(newsItems.publishedAt, to)))
  const items = selectItems(stored, { from, to, max: period === "day" ? 60 : 80 })
  if (period === "day" && board) {
    for (const index of board.indexes) {
      const change = index.day.percent
      items.unshift({ id: randomUUID(), source: "Saved market quotes", title: `${index.symbol} ${change < 0 ? "fell" : "rose"} ${Math.abs(change)}% versus the previous close. ETF price: $${index.price}.`, summary: `Captured ${board.asOf}. These are ETF proxies, not index levels.`, publishedAt: now, url: `https://finnhub.io/` })
    }
  }
  // Too little to write from (every feed down): publish nothing, so a later run can still write this period.
  if (items.length < 3) return { period, periodEnd, items: items.length, skipped: "too few stories" as const }

  const result = await writeBrief({ client: client(), period, sessionDate: periodEnd, items, deadline, briefing: morning ? "Opening-session briefing. The session is still in progress; do not describe these moves as closing results." : undefined, ledger: ledgerFor(period, periodEnd, now) })

  // Keep only the items the recap cites, so links survive pruning.
  const cited = new Set([...result.brief.sourceIds, ...result.brief.takeaways.flatMap((t) => t.sourceIds)])
  const sources = items.filter((i) => cited.has(i.id)).map((i) => ({ id: i.id, source: i.source, title: i.title, url: i.url }))

  const values = {
    period,
    periodEnd,
    headline: result.brief.headline,
    body: result.brief.body,
    takeaways: result.brief.takeaways,
    sources,
    model: result.fallback ? null : NEWS_MODEL,
    fallback: result.fallback,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd.toFixed(6),
    createdAt: now,
  }
  await db
    .insert(newsBriefs)
    .values(values)
    .onConflictDoUpdate({ target: [newsBriefs.period, newsBriefs.periodEnd], set: values })
  return { period, periodEnd, items: items.length, fallback: result.fallback, problems: result.problems, costUsd: result.costUsd }
}

/**
 * The nightly news run: store new headlines, then write whichever recaps are
 * due and missing: the latest completed trading day's, and the latest completed
 * week's (so a Friday that failed is written on Monday). `force` rewrites them.
 */
export async function runNews(now = new Date(), { force = false, slot = "close" }: { force?: boolean; slot?: NewsSlot } = {}) {
  const deadline = Date.now() + 250_000
  const session = regularSession(now)
  if (!session) return { fetched: 0, skipped: "not a trading day", briefs: [] }
  const market = await updateNewsMarket(slot, now)
  const { items, failures } = await fetchFeeds()
  if (items.length) {
    await db
      .insert(newsItems)
      .values(items.map((i) => ({ source: i.source, title: i.title, url: i.url, summary: i.summary, publishedAt: i.publishedAt })))
      .onConflictDoNothing({ target: newsItems.url })
  }
  await db.delete(newsItems).where(lt(newsItems.publishedAt, new Date(now.getTime() - KEEP_DAYS * DAY)))

  const targets = slot === "morning" ? { day: session.date, week: null } : briefTargets(now)
  const exists = async (period: BriefPeriod, date: string) =>
    (await db.select({ id: newsBriefs.id }).from(newsBriefs).where(and(eq(newsBriefs.period, period), eq(newsBriefs.periodEnd, date))).limit(1)).length > 0

  const briefs = []
  const [daily] = targets.day ? await db.select({ createdAt: newsBriefs.createdAt }).from(newsBriefs).where(and(eq(newsBriefs.period, "day"), eq(newsBriefs.periodEnd, targets.day))).limit(1) : []
  if (targets.day && (force || canPublishDaily(slot, daily?.createdAt ?? null, targets.day))) briefs.push(await publish("day", targets.day, now, market.board, slot === "morning", deadline))
  if (targets.week && (force || !(await exists("week", targets.week)))) briefs.push(await publish("week", targets.week, now, null, false, deadline))
  return { fetched: items.length, feedFailures: failures, targets, briefs, market: { board: Boolean(market.board), earnings: Boolean(market.earnings), fearGreed: Boolean(market.fearGreed) } }
}

export type PublishedBrief = {
  period: BriefPeriod
  phase: "morning" | "close"
  periodEnd: string
  headline: string
  body: string
  takeaways: { title: string; body: string; sourceIds: string[] }[]
  sources: { id: string; source: string; title: string; url: string }[]
  fallback: boolean
  createdAt: string
}

/** What the News page shows: the latest recap of each kind and the freshest headlines. Database reads only. */
export async function readNews() {
  const latest = async (period: BriefPeriod) => {
    const [row] = await db.select().from(newsBriefs).where(eq(newsBriefs.period, period)).orderBy(desc(newsBriefs.periodEnd)).limit(1)
    if (!row) return null
    return {
      period,
      phase: period === "midday" || (period === "day" && new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(row.createdAt) === row.periodEnd && nyMinutes(row.createdAt) < 990) ? "morning" : "close",
      periodEnd: row.periodEnd,
      headline: row.headline,
      body: row.body,
      takeaways: row.takeaways as PublishedBrief["takeaways"],
      sources: row.sources as PublishedBrief["sources"],
      fallback: row.fallback,
      createdAt: row.createdAt.toISOString(),
    } satisfies PublishedBrief
  }
  const [day, week, headlines, midday] = await Promise.all([
    latest("day"),
    latest("week"),
    db
      .select({ source: newsItems.source, title: newsItems.title, url: newsItems.url, summary: newsItems.summary, publishedAt: newsItems.publishedAt })
      .from(newsItems)
      .orderBy(desc(newsItems.publishedAt))
      .limit(12),
    latest("midday"), // Preserve already-published updates from PR #104 until a new brief replaces them.
  ])
  return { day: midday && (!day || midday.periodEnd > day.periodEnd) ? midday : day, week, headlines: headlines.map((h) => ({ ...h, publishedAt: h.publishedAt.toISOString() })) }
}

export type NewsResponse = Awaited<ReturnType<typeof readNews>>
