import "server-only"
import { and, eq } from "drizzle-orm"
import { db, fantasyLeagues, fantasyMembers } from "@web/db"
import { requireMembership } from "@web/lib/social"
import type { PageContext } from "@web/lib/ai/limits"

/**
 * Checks the league the browser says is open against the signed-in user's memberships, and returns its name.
 * The id from the browser is only a hint: if the person isn't a member (or the id is made up), the page
 * context is returned without it, so neither the prompt nor the tools ever act on a league they can't see.
 */
export async function verifyPageEntity(userId: string, context: PageContext): Promise<{ context: PageContext; entityName: string | null }> {
  if (!context.entityId || (context.page !== "leagues" && context.page !== "fantasy")) return { context, entityName: null }
  const leagueId = context.entityId
  try {
    if (context.page === "leagues") {
      const { league } = await requireMembership(userId, leagueId)
      return { context, entityName: league.name }
    }
    const [row] = await db
      .select({ name: fantasyLeagues.name })
      .from(fantasyMembers)
      .innerJoin(fantasyLeagues, eq(fantasyMembers.leagueId, fantasyLeagues.id))
      .where(and(eq(fantasyMembers.userId, userId), eq(fantasyMembers.leagueId, leagueId)))
      .limit(1)
    if (row) return { context, entityName: row.name }
  } catch {
    // Not a member, or not found: fall through and drop the id.
  }
  return { context: { ...context, entityId: undefined }, entityName: null }
}
