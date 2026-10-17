import { NextResponse } from "next/server"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { toggleNoteReaction } from "@web/lib/fantasy-notes"

type Ctx = { params: Promise<{ id: string; noteId: string }> }

/** Toggles one of the standings emoji on a note. */
export const POST = withUser<Ctx>(async (userId, request, { params }) => {
  const { id, noteId } = await params
  const { emoji } = await readJson<{ emoji?: unknown }>(request)
  if (typeof emoji !== "string") throw new ApiError("emoji is required")
  return NextResponse.json(await toggleNoteReaction(userId, id, noteId, emoji))
})
