import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { db } from "@web/db"
import { takeRateLimit } from "@web/lib/sports/store"
import OpenAI from "openai"
import { IMAGE_TYPES, ImportAiError, parseWithAi } from "@web/lib/import-ai"
import { parseHoldingsText } from "@web/lib/import-parse"

export const maxDuration = 60

const Body = z
  .object({
    text: z.string().max(200_000, "That's too much to read at once").default(""),
    /** A screenshot of holdings, base64 (the browser shrinks it first). About 4 MB at most. */
    image: z.object({ mediaType: z.enum(IMAGE_TYPES), data: z.string().min(100).max(5_600_000).regex(/^[A-Za-z0-9+/=]+$/) }).optional(),
  })
  .refine((b) => b.image || b.text.trim().length >= 3, { message: "Paste something first" })

/**
 * Turns pasted or uploaded holdings into a preview. Nothing is saved here.
 * A table or a simple list is read locally for free; anything messier goes to
 * the AI reader when it is switched on.
 */
export const POST = withUser<unknown>(async (userId, request) => {
  const parsed = Body.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Paste something first")

  const local = parsed.data.image ? null : parseHoldingsText(parsed.data.text)
  if (local) return NextResponse.json({ ...local, reader: "table" as const })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    if (parsed.data.image) throw new ApiError("Reading screenshots isn't switched on yet. Paste the text of your positions instead.", 422)
    throw new ApiError("We couldn't read that as a table. Upload a CSV from your brokerage, or type one holding per line, like AAPL 10 @ 150.", 422)
  }
  // AI reads cost money, so each person gets a modest number an hour (LIMITS.importAi).
  if (!(await takeRateLimit(db, "importAi", userId))) throw new ApiError("That's a lot of imports for one hour. Try again a bit later, or upload a CSV.", 429)

  try {
    const outcome = await parseWithAi(parsed.data.text, { client: new OpenAI({ apiKey, maxRetries: 0, timeout: 45_000 }), image: parsed.data.image })
    if (outcome.rows.length === 0) throw new ApiError("We didn't find any holdings in that. Try copying the table of positions, or a clearer screenshot.", 422)
    return NextResponse.json({ ...outcome, reader: "ai" as const })
  } catch (error) {
    if (error instanceof ImportAiError) throw new ApiError(error.message, 502)
    throw error
  }
})
