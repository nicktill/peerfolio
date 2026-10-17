import { FantasyHome } from "@web/components/fantasy/fantasy-home"
import { sportsAccessForRequest } from "@web/lib/sports/access"

/**
 * Decides Sports access on the server (session + ADMIN_EMAILS) so the Stocks / Sports cards are right on first paint.
 * In "1" and off mode no session is read and the page stays static; any failure falls back to the client check.
 */
export default async function FantasyPage() {
  let enabled: boolean | null = null
  try {
    enabled = await sportsAccessForRequest()
  } catch {
    /* the client hook asks /api/sports/access instead */
  }
  return <FantasyHome sportsEnabled={enabled} />
}
