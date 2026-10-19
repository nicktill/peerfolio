import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { removeFantasyMember, setMemberInactive } from "@web/lib/fantasy"

type Ctx = { params: Promise<{ id: string; userId: string }> }

const Patch = z.object({ inactive: z.boolean() }).strict()

/** Owner only: bench a member, or bring them back. */
export const PATCH = withUser<Ctx>(async (userId, request, { params }) => {
  const { id, userId: target } = await params
  const parsed = Patch.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Say whether they're inactive")
  await setMemberInactive(userId, id, target, parsed.data.inactive)
  return NextResponse.json({ ok: true })
})

/** Owner only: remove a member from the league. */
export const DELETE = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id, userId: target } = await params
  await removeFantasyMember(userId, id, target)
  return NextResponse.json({ ok: true })
})
