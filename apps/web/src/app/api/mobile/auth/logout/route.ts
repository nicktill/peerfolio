import { NextResponse } from "next/server"
import { z } from "zod"
import { readJson, withPublic } from "@web/lib/api"
import { revokeRefreshToken } from "@web/lib/mobile-auth-core"
import { refreshStore } from "@web/lib/mobile-auth"

const Logout = z.object({ refreshToken: z.string().min(20).max(256) })

/** Revokes the refresh-token family. Idempotent: an unknown or already-revoked token is still a success. */
export const POST = withPublic<unknown>(async (request) => {
  const parsed = Logout.safeParse(await readJson(request))
  if (parsed.success) await revokeRefreshToken(refreshStore, parsed.data.refreshToken)
  return NextResponse.json({ ok: true })
})
