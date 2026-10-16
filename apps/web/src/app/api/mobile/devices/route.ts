import { NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db, deviceTokens } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { enforceMobileLimit } from "@web/lib/mobile-rate-limit"

// APNs device tokens are 32 bytes of hex (64 chars) today; allow room for longer ones Apple may introduce.
const Device = z.object({
  token: z.string().regex(/^[0-9a-fA-F]{32,200}$/, "Invalid device token"),
  environment: z.enum(["sandbox", "production"]).default("production"),
})

/**
 * Registers (or refreshes) this device for push notifications. Groundwork only: nothing sends to these tokens yet.
 * A token belongs to one user at a time: signing in as someone else on the same phone moves it.
 */
export const POST = withUser<unknown>(async (userId, request) => {
  await enforceMobileLimit(request, "device")
  const parsed = Device.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid device")
  const token = parsed.data.token.toLowerCase()

  await db
    .insert(deviceTokens)
    .values({ userId, token, environment: parsed.data.environment })
    .onConflictDoUpdate({ target: deviceTokens.token, set: { userId, environment: parsed.data.environment, lastSeenAt: new Date() } })
  return NextResponse.json({ ok: true })
})

/** Unregisters a device, called on sign-out so a shared phone stops receiving the previous person's notifications. */
export const DELETE = withUser<unknown>(async (userId, request) => {
  const parsed = z.object({ token: z.string().min(32).max(200) }).safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Invalid device token")
  await db.delete(deviceTokens).where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, parsed.data.token.toLowerCase())))
  return NextResponse.json({ ok: true })
})
