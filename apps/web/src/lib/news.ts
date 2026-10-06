import "server-only"
import OpenAI from "openai"
import { and, desc, eq, gte, lt, sql } from "drizzle-orm"
import { db } from "@web/db"
import { newsBriefs, newsItems } from "@web/db/schema"
import { fetchFeeds } from "@web/lib/news-feeds"
import { isLastSessionOfWeek, NEWS_MODEL, selectItems, writeBrief, type BriefPeriod } from "@web/lib/news-brief"
import { regularSession } from "@web/lib/market-hours"

/** Most the recap may spend in a calendar month (UTC). Past it, recaps are written from headlines only. */
const MONTHLY_BUDGET_USD = Number(process.env.NEWS_AI_MONTHLY_BUDGET_USD) || 1
/** Generous upper bound for one recap, retries included, checked before calling. */
const WORST_CASE_USD = 0.03
/** Headlines older than this are pruned; the weekly recap needs the last seven days. */
const KEEP_DAYS = 21

const DAY = 86_400_000
const isSession = (date: string) => regularSession(new Date(`${date}T16:00:00Z`)) !== null

function client() {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey, maxRetries: 1, timeout: 90_000 }) : null
}

async function spentThisMonth(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${newsBriefs.costUsd}), 0)` })
    .from(newsBriefs)
    .where(gte(newsBriefs.createdAt, start))
  return Number(row?.total ?? 0)
}

async function publish(period: BriefPeriod, periodEnd: string, from: Date, to: Date, max: number, now: Date) {
  const stored = await db
    .select()
    .from(newsItems)
    .where(and(gte(newsItems.publishedAt, from), lt(newsItems.publishedAt, to)))
  const items = selectItems(stored, { from, to, max })
  // Too little to write from (every feed down): publish nothing, so the next run can still write this period.
  if (items.length < 3) return { period, periodEnd, items: items.length, skipped: "too few stories" as const }

  const spent = await spentThisMonth(now)
  const ai = spent + WORST_CASE_USD <= MONTHLY_BUDGET_USD ? client() : null
  const result = await writeBrief({ client: ai, period, sessionDate: periodEnd, items })

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
  return { period, periodEnd, items: items.length, fallback: result.fallback, problems: result.problems, costUsd: result.costUsd, spentBefore: spent }
}

/**
 * The nightly news run: store new headlines, then write the day's recap (on a
 * trading day) and the week's (after its last session) if they don't exist yet.
 * `force` rewrites an existing recap for the period.
 */
export async function runNews(now = new Date(), { force = false }: { force?: boolean } = {}) {
  const { items, failures } = await fetchFeeds()
  if (items.length) {
    await db
      .insert(newsItems)
      .values(items.map((i) => ({ source: i.source, title: i.title, url: i.url, summary: i.summary, publishedAt: i.publishedAt })))
      .onConflictDoNothing({ target: newsItems.url })
  }
  await db.delete(newsItems).where(lt(newsItems.publishedAt, new Date(now.getTime() - KEEP_DAYS * DAY)))

  const session = regularSession(now)
  const briefs = []
  if (session) {
    const existing = async (period: BriefPeriod) =>
      (await db.select({ id: newsBriefs.id }).from(newsBriefs).where(and(eq(newsBriefs.period, period), eq(newsBriefs.periodEnd, session.date))).limit(1)).length > 0

    // The day: from yesterday evening to now, so pre-market and overnight stories count.
    if (force || !(await existing("day"))) briefs.push(await publish("day", session.date, new Date(now.getTime() - 30 * 3_600_000), now, 60, now))
    if (isLastSessionOfWeek(session.date, isSession) && (force || !(await existing("week")))) {
      briefs.push(await publish("week", session.date, new Date(now.getTime() - 7 * DAY), now, 80, now))
    }
  }
  return { fetched: items.length, feedFailures: failures, session: session?.date ?? null, briefs }
}

export type PublishedBrief = {
  period: BriefPeriod
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
      periodEnd: row.periodEnd,
      headline: row.headline,
      body: row.body,
      takeaways: row.takeaways as PublishedBrief["takeaways"],
      sources: row.sources as PublishedBrief["sources"],
      fallback: row.fallback,
      createdAt: row.createdAt.toISOString(),
    } satisfies PublishedBrief
  }
  const [day, week, headlines] = await Promise.all([
    latest("day"),
    latest("week"),
    db
      .select({ source: newsItems.source, title: newsItems.title, url: newsItems.url, summary: newsItems.summary, publishedAt: newsItems.publishedAt })
      .from(newsItems)
      .orderBy(desc(newsItems.publishedAt))
      .limit(12),
  ])
  return { day, week, headlines: headlines.map((h) => ({ ...h, publishedAt: h.publishedAt.toISOString() })) }
}

export type NewsResponse = Awaited<ReturnType<typeof readNews>>
