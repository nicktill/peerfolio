import "server-only"
import { and, eq, gte, sql } from "drizzle-orm"
import { db } from "@web/db"
import { aiUsage } from "@web/db/schema"
import { decide, type Decision } from "@web/lib/ai/limits"

const spent = sql<string>`coalesce(sum(coalesce(${aiUsage.costUsd}, ${aiUsage.reservedUsd})), 0)`

/**
 * Checks the limits and, if the request fits, records its reservation, in one
 * transaction so two requests started together can't both squeeze under a cap.
 * Unsettled reservations count at their worst case until `settle` replaces them.
 */
export async function reserve(userId: string, model: string, usd: number): Promise<{ decision: Decision; id: string | null }> {
  return db.transaction(async (tx) => {
    // Serialize this person's requests; the month total is read under the same lock.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"ai_usage:" + userId}))`)
    const now = Date.now()
    const monthStart = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1))
    const [hour] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, new Date(now - 3_600_000))))
    const [day] = await tx
      .select({ total: spent })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, new Date(now - 86_400_000))))
    const [month] = await tx.select({ total: spent }).from(aiUsage).where(gte(aiUsage.createdAt, monthStart))

    const decision = decide(
      { requestsLastHour: hour?.n ?? 0, userUsdLastDay: Number(day?.total ?? 0), monthUsd: Number(month?.total ?? 0) },
      usd,
    )
    if (!decision.ok) return { decision, id: null }

    const [row] = await tx.insert(aiUsage).values({ userId, model, reservedUsd: usd.toFixed(6) }).returning({ id: aiUsage.id })
    return { decision, id: row!.id }
  })
}

/** Replaces a reservation with what the request actually used. A failed request keeps its reservation. */
export async function settle(id: string, actual: { inputTokens: number; outputTokens: number; costUsd: number }) {
  await db
    .update(aiUsage)
    .set({ costUsd: actual.costUsd.toFixed(6), inputTokens: actual.inputTokens, outputTokens: actual.outputTokens })
    .where(eq(aiUsage.id, id))
}
