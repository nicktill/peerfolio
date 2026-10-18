import "server-only"
import { and, eq } from "drizzle-orm"
import { db, fantasyLeagues, fantasyMembers, sportsLeagues, sportsMembers } from "@web/db"
import { sportsAccessFor } from "@web/lib/sports/access"
import { requireMembership } from "@web/lib/social"
import type { PageContext } from "@web/lib/ai/limits"

/**
 * Checks the league the browser says is open against the signed-in user's memberships, and returns its name.
 * The id from the browser is only a hint: if the person isn't a member (or the id is made up), the page
 * context is returned without it, so neither the prompt nor the tools ever act on a league they can't see.
 */
export async function verifyPageEntity(userId: string, context: PageContext): Promise<{ context: PageContext; entityName: string | null }> {
  if (!context.entityId || (context.page !== "leagues" && context.page !== "fantasy" && context.page !== "sports")) return { context, entityName: null }
  const leagueId = context.entityId
  try {
    if (context.page === "leagues") {
      const { league } = await requireMembership(userId, leagueId)
      return { context, entityName: league.name }
    }
    if (context.page === "sports") {
      // Sports follows its own access rule (flag, then beta grant); a non-member or an off flag drops the id.
      if (await sportsAccessFor(userId)) {
        const [league] = await db
          .select({ name: sportsLeagues.name })
          .from(sportsMembers)
          .innerJoin(sportsLeagues, eq(sportsMembers.leagueId, sportsLeagues.id))
          .where(and(eq(sportsMembers.userId, userId), eq(sportsMembers.leagueId, leagueId)))
          .limit(1)
        if (league) return { context, entityName: league.name }
      }
      return { context: { ...context, entityId: undefined }, entityName: null }
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
