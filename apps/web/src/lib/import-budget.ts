import "server-only"
import { gte, sql } from "drizzle-orm"
import { db, importAiSpend } from "@web/db"
import { ApiError } from "@web/lib/api"
import { importReservationUsd } from "@web/lib/import-ai"

export async function reserveImport(userId: string, text: string) {
  const raw = Number(process.env.IMPORT_AI_MONTHLY_BUDGET_USD ?? "1")
  const cap = Number.isFinite(raw) && raw >= 0 ? raw : 0
  const usd = importReservationUsd(text)
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(4207002)`)
    // Use database time so clocks on separate instances cannot disagree.
    const [row] = await tx.select({
      recent: sql<number>`count(*) filter (where user_id = ${userId}::uuid and created_at >= now() - interval '1 hour')::int`,
    }).from(importAiSpend).where(gte(importAiSpend.createdAt, sql`least(date_trunc('month', now() at time zone 'UTC') at time zone 'UTC', now() - interval '1 hour')`))
    // Previous-month rows are only for the rolling hourly count.
    const [monthly] = await tx.select({ total: sql<string>`coalesce(sum(${importAiSpend.reservedUsd}), 0)` }).from(importAiSpend)
      .where(gte(importAiSpend.createdAt, sql`date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'`))
    if (Number(row?.recent ?? 0) >= 12) throw new ApiError("That's a lot of imports for one hour. Try again later, or upload a CSV.", 429)
    if (Number(monthly?.total ?? 0) + usd > cap) throw new ApiError("The AI reader's monthly budget is used up. Upload a CSV or enter holdings manually.", 429)
    await tx.insert(importAiSpend).values({ userId, reservedUsd: (Math.ceil(usd * 1_000_000) / 1_000_000).toFixed(6) })
  })
}
