import { createHash, timingSafeEqual } from "node:crypto"

/**
 * A single, env-gated sign-in for Apple's App Review team, who cannot use their own Apple or Google identity.
 * Off unless both variables are set. It signs in exactly one pre-agreed email, so it cannot reach any other account.
 */
export type ReviewLoginConfig = { email: string; code: string; seedDemo: boolean }

export function reviewLoginConfig(env: Record<string, string | undefined> = process.env): ReviewLoginConfig | null {
  const email = env.APP_REVIEW_EMAIL?.trim().toLowerCase()
  const code = env.APP_REVIEW_CODE?.trim()
  // A short code would be guessable even behind the rate limit.
  if (!email || !email.includes("@") || !code || code.length < 20) return null
  return { email, code, seedDemo: env.APP_REVIEW_SEED_DEMO === "true" }
}

const digest = (value: string) => createHash("sha256").update(value).digest()

export function matchesReviewLogin(config: ReviewLoginConfig, email: string, code: string): boolean {
  // Hash both sides so the comparison is constant-time whatever the lengths are.
  const emailOk = timingSafeEqual(digest(config.email), digest(email.trim().toLowerCase()))
  const codeOk = timingSafeEqual(digest(config.code), digest(code))
  return emailOk && codeOk
}
