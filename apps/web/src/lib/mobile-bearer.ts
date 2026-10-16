import { headers } from "next/headers"
import { bearerToken, mobileAuthConfig, verifyAccessToken } from "@web/lib/mobile-auth-core"

/**
 * The caller identified by an `Authorization: Bearer` access token, for the native app.
 *
 * `present` says whether a bearer header was sent at all. When it was, the answer is final: a bad or expired token
 * is a 401 the app answers by refreshing, not a cue to fall back to a cookie. Requests without the header (every
 * request the website makes) return immediately and are handled by next-auth exactly as before.
 */
export async function bearerUserId(): Promise<{ present: boolean; userId: string | null }> {
  let header: string | null
  try {
    header = (await headers()).get("authorization")
  } catch {
    return { present: false, userId: null }
  }
  const token = bearerToken(header)
  if (!token) return { present: false, userId: null }

  const config = mobileAuthConfig()
  return { present: true, userId: config ? await verifyAccessToken(token, config) : null }
}
