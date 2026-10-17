import { NextResponse } from "next/server"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { addReply } from "@web/lib/fantasy-notes"

type Ctx = { params: Promise<{ id: string; noteId: string }> }

export const POST = withUser<Ctx>(async (userId, request, { params }) => {
  const { id, noteId } = await params
  const { body } = await readJson<{ body?: unknown }>(request)
  if (typeof body !== "string") throw new ApiError("Write a reply first")
  return NextResponse.json(await addReply(userId, id, noteId, body), { status: 201 })
})
