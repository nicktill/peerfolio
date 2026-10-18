import "server-only"
import { eq } from "drizzle-orm"
import { db, users } from "@web/db"
import { getCurrentUserId } from "@web/lib/auth"
import { isAdminEmail } from "@web/lib/plaid-access-core"
import { sportsAllowed, sportsMode } from "./flag.ts"

/** Admin status from the server-side ADMIN_EMAILS allowlist (never sent to the client). */
export async function isAdminUser(userId: string): Promise<boolean> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  return !!user && isAdminEmail(user.email, process.env.ADMIN_EMAILS)
}

/** Admins, plus anyone an admin granted the sports beta to (only consulted while sports is in "admin" mode). */
export async function hasSportsBeta(userId: string): Promise<boolean> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  return !!user && (user.sportsAccess || isAdminEmail(user.email, process.env.ADMIN_EMAILS))
}

/** Whether this signed-in (or signed-out, null) visitor may use sports under the current mode. Reads no session in "1" or off mode. */
export async function sportsAccessFor(userId: string | null): Promise<boolean> {
  return sportsAllowed(sportsMode(), userId, hasSportsBeta)
}

/** For server pages: resolves the session only in admin mode so "1" and off keep pages static. */
export async function sportsAccessForRequest(): Promise<boolean> {
  const mode = sportsMode()
  if (mode !== "admin") return mode === "all"
  return sportsAllowed(mode, await getCurrentUserId(), hasSportsBeta)
}
