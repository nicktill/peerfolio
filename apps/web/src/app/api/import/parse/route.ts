import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { ImportAiError, parseWithClaude } from "@web/lib/import-ai"
import { reserveImport } from "@web/lib/import-budget"
import { parseHoldingsText } from "@web/lib/import-parse"

export const maxDuration = 60

const Body = z.object({ text: z.string().min(3, "Paste something first").max(200_000, "That's too much to read at once") })

/**
 * Turns pasted or uploaded holdings into a preview. Nothing is saved here.
 * A table or a simple list is read locally for free; anything messier goes to
 * the AI reader when it is switched on.
 */
export const POST = withUser<unknown>(async (userId, request) => {
  const parsed = Body.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Paste something first")

  const local = parseHoldingsText(parsed.data.text)
  if (local) return NextResponse.json({ ...local, reader: "table" as const })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new ApiError("We couldn't read that as a table. Upload a CSV from your brokerage, or type one holding per line, like AAPL 10 @ 150.", 422)
  }
  await reserveImport(userId, parsed.data.text)

  try {
    const outcome = await parseWithClaude(parsed.data.text, { apiKey })
    if (outcome.rows.length === 0) throw new ApiError("We didn't find any holdings in that. Try copying the table of positions.", 422)
    return NextResponse.json({ ...outcome, reader: "ai" as const })
  } catch (error) {
    if (error instanceof ImportAiError) throw new ApiError(error.message, 502)
    throw error
  }
})
