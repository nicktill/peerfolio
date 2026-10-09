import { timingSafeEqual } from "node:crypto"

/**
 * Where the developer login may run.
 *
 * - "local": a non-production build on a developer's machine. Any existing user, no passcode.
 * - "preview": a Vercel *preview* deployment, so a branch can be looked at without a Google
 *   OAuth app for every preview URL. It opens only the demo accounts, and only when the
 *   deployment says its database is the throwaway demo one (`DEV_LOGIN_DEMO_DATABASE=true`),
 *   so a preview that points at real data can never offer it. A passcode is asked for only
 *   if `DEV_LOGIN_SECRET` is set.
 * - "off": everywhere else, production above all. `VERCEL_ENV === "production"` is checked
 *   first so no other setting can turn it on there.
 */
export type DevLoginMode = "off" | "local" | "preview"

export function devLoginMode(env: NodeJS.ProcessEnv = process.env): DevLoginMode {
  if (env.ENABLE_DEV_LOGIN !== "true") return "off"
  if (env.VERCEL_ENV === "production") return "off"
  if (env.VERCEL_ENV === "preview") return env.DEV_LOGIN_DEMO_DATABASE === "true" ? "preview" : "off"
  return env.NODE_ENV !== "production" ? "local" : "off"
}

/** The people `ensureDemoUser` builds, matching the handles in demo-data. */
export const DEMO_EMAILS = ["theo", "maya", "deshawn", "priya", "sam"].map((handle) => `${handle}@example.com`)

/** Accounts the preview login may open: `DEV_LOGIN_EMAILS` if set, otherwise the demo people. */
export function previewAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  const listed = (env.DEV_LOGIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  return listed.length > 0 ? listed : DEMO_EMAILS
}

/** A passcode is asked for only when one is configured. Previews on the demo database need none. */
export function passcodeRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.DEV_LOGIN_SECRET ?? "").length >= 16
}

/** Constant-time passcode check, so response timing doesn't leak how much matched. */
export function passcodeMatches(given: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = env.DEV_LOGIN_SECRET ?? ""
  if (!given || expected.length < 16) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
