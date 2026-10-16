import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { saveNote } from "@web/lib/fantasy-notes"

type Ctx = { params: Promise<{ id: string }> }

const Note = z.object({ tradeId: z.string().uuid().optional(), pickId: z.string().uuid().optional(), body: z.string().max(600) })

/** Writes (or rewrites) the note on one of your own trades or picks. */
export const POST = withUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const parsed = Note.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Say which trade or pick, and write a few words")
  return NextResponse.json(await saveNote(userId, id, parsed.data, parsed.data.body), { status: 201 })
})
