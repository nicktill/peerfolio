import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withPublic } from "@web/lib/api"
import { mobileAuthConfig, rotateRefreshToken } from "@web/lib/mobile-auth-core"
import { refreshStore } from "@web/lib/mobile-auth"
import { enforceMobileLimit } from "@web/lib/mobile-rate-limit"

const Refresh = z.object({ refreshToken: z.string().min(20).max(256) })

/** Exchanges a refresh token for a new access + refresh pair. Each refresh token works once. */
export const POST = withPublic<unknown>(async (request) => {
  const config = mobileAuthConfig()
  if (!config) throw new ApiError("Mobile sign-in isn't available right now.", 503)
  await enforceMobileLimit(request, "refresh")

  const parsed = Refresh.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Invalid refresh request")

  const result = await rotateRefreshToken(refreshStore, config, parsed.data.refreshToken)
  // One answer for every failure, so the response says nothing about which tokens exist. The app signs out on 401.
  if (!result.ok) throw new ApiError("Please sign in again.", 401)
  return NextResponse.json(result.session, { headers: { "Cache-Control": "no-store" } })
})
