import { NextResponse } from "next/server"
import { z } from "zod"
import { db, leagueMembers, leagues } from "@web/db"
import { generateInviteCode } from "@web/lib/crypto"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { listLeaguesForUser } from "@web/lib/social"

const CreateLeague = z.object({
  name: z.string().trim().min(2, "Name is too short").max(40, "Name is too long"),
  description: z.string().trim().max(160).optional(),
  emoji: z.string().trim().min(1).max(8).default("🏆"),
  accent: z.enum(["emerald", "violet", "amber", "sky", "rose"]).default("emerald"),
})

export const GET = withUser<unknown>(async (userId) => {
  return NextResponse.json({ leagues: await listLeaguesForUser(userId) })
})

export const POST = withUser<unknown>(async (userId, request) => {
  const parsed = CreateLeague.safeParse(await readJson(request))
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid league")
  }

  const [league] = await db
    .insert(leagues)
    .values({ ...parsed.data, ownerId: userId, inviteCode: generateInviteCode() })
    .returning()

  await db.insert(leagueMembers).values({ leagueId: league!.id, userId, role: "owner" })

  return NextResponse.json({ league }, { status: 201 })
})
