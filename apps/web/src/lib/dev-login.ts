import { timingSafeEqual } from "node:crypto"

/**
 * Where the developer login may run.
 *
 * - "local": a non-production build on a developer's machine. Any existing user, no passcode.
 * - "preview": a Vercel *preview* deployment, so a branch can be looked at without a Google
 *   OAuth app for every preview URL. It needs a passcode and an allowlist of accounts, and it
 *   stays off unless both are set.
 * - "off": everywhere else, production above all. `VERCEL_ENV === "production"` is checked
 *   first so no other setting can turn it on there.
 */
export type DevLoginMode = "off" | "local" | "preview"

export function devLoginMode(env: NodeJS.ProcessEnv = process.env): DevLoginMode {
  if (env.ENABLE_DEV_LOGIN !== "true") return "off"
  if (env.VERCEL_ENV === "production") return "off"
  if (env.VERCEL_ENV === "preview") return previewAllowlist(env).length > 0 && (env.DEV_LOGIN_SECRET ?? "").length >= 16 ? "preview" : "off"
  return env.NODE_ENV !== "production" ? "local" : "off"
}

/** Accounts the preview login may open, from a comma-separated env var. */
export function previewAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.DEV_LOGIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

/** Constant-time passcode check, so response timing doesn't leak how much matched. */
export function passcodeMatches(given: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = env.DEV_LOGIN_SECRET ?? ""
  if (!given || expected.length < 16) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
