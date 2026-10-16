import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withPublic } from "@web/lib/api"
import { IdentityError, identityAudiences, issueSession, mobileAuthConfig, verifyIdentityToken } from "@web/lib/mobile-auth-core"
import { publicUser, refreshStore, resolveUserForIdentity } from "@web/lib/mobile-auth"

const Exchange = z.object({
  provider: z.enum(["apple", "google"]),
  idToken: z.string().min(20).max(8192),
  /** The raw nonce the app hashed and gave the provider. */
  nonce: z.string().min(8).max(256),
  /** Apple only returns the name to the app, once, on first sign-in. */
  fullName: z.string().trim().max(80).optional(),
})

/**
 * Native sign-in: trades a Sign in with Apple or Google ID token for this API's own short-lived access token and a
 * rotating refresh token. The website never calls this.
 */
export const POST = withPublic<unknown>(async (request) => {
  const config = mobileAuthConfig()
  if (!config) throw new ApiError("Mobile sign-in isn't available right now.", 503)

  const parsed = Exchange.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Invalid sign-in request")
  const { provider, idToken, nonce, fullName } = parsed.data

  let identity
  try {
    identity = await verifyIdentityToken(provider, idToken, nonce, { audiences: identityAudiences(provider) })
  } catch (error) {
    if (error instanceof IdentityError) throw new ApiError(error.message, 401)
    throw error
  }

  const userId = await resolveUserForIdentity(identity, fullName)
  const session = await issueSession(refreshStore, config, userId)
  return NextResponse.json({ ...session, user: await publicUser(userId) }, { headers: { "Cache-Control": "no-store" } })
})
