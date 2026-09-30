import { NextResponse } from "next/server"
import { z } from "zod"
import { investableTotal, writeDailySnapshot } from "@web/lib/plaid-sync"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { importPositions, requireManualAccount } from "@web/lib/positions"

export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

const Body = z.object({
  rows: z
    .array(
      z.object({
        symbol: z.string().trim().min(1).max(12),
        kind: z.enum(["stock", "crypto"]).default("stock"),
        quantity: z.number().finite().positive().max(1e12),
        avgCost: z.number().finite().positive().max(1e9).nullable().optional(),
        name: z.string().trim().max(80).nullable().optional(),
      }),
    )
    .min(1, "Nothing to import")
    .max(300, "Import up to 300 holdings at a time"),
  /** Make the account match the list: positions it doesn't mention are removed. */
  replace: z.boolean().default(false),
})

/** Saves a confirmed import into a manual investment account. */
export const POST = withUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const account = await requireManualAccount(userId, id)
  if (account.category !== "investment") throw new ApiError("Positions can only be added to investment accounts")

  const parsed = Body.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid import")

  // Money that arrives with the import is a flow, like a deposit: bringing your
  // holdings in must not read as a gain.
  const before = await investableTotal(userId)
  const result = await importPositions(id, userId, parsed.data.rows, { replace: parsed.data.replace })
  await writeDailySnapshot(userId, (await investableTotal(userId)) - before)

  return NextResponse.json(result, { status: 200 })
})
