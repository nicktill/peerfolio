import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { saveDraftPicks } from "@web/lib/fantasy-draft"

type Ctx = { params: Promise<{ id: string }> }

const Picks = z.object({
  tickers: z.array(z.string().trim().min(1).max(12)).min(1, "Pick at least one stock").max(10),
  /** Optional "why I picked this", by ticker. */
  notes: z.record(z.string(), z.string().max(280)).optional(),
})

/** Saves your stocks for the draft round that is open. Refused once the deadline has passed. */
export const PUT = withUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const parsed = Picks.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid picks")
  return NextResponse.json(await saveDraftPicks(userId, id, parsed.data))
})
