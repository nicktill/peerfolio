import { NextResponse } from "next/server"
import { z } from "zod"
import { investableTotal, writeDailySnapshot } from "@web/lib/plaid-sync"
import { ApiError, readJson, withPortfolioUser } from "@web/lib/api"
import { importPositions, prepareImportPrices, type PreparedImportPrices, requireManualAccount } from "@web/lib/positions"
import { recordAccountEvent } from "@web/lib/account-events"

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
        /** The price the source showed; used only when no market data source can price the ticker. */
        price: z.number().finite().positive().max(1e9).nullable().optional(),
      }),
    )
    .min(1, "Nothing to import")
    .max(300, "Import up to 300 holdings at a time"),
  /** Make the account match the list: positions it doesn't mention are removed. */
  replace: z.boolean().default(false),
})

/** Saves a confirmed import into a manual investment account. */
export const POST = withPortfolioUser<Ctx, PreparedImportPrices>(async (userId, request, { params }, prepared) => {
  const { id } = await params
  const account = await requireManualAccount(userId, id)
  if (account.category !== "investment") throw new ApiError("Positions can only be added to investment accounts")

  const parsed = Body.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid import")

  // Money that arrives with the import is a flow, like a deposit: bringing your
  // holdings in must not read as a gain.
  const before = await investableTotal(userId)
  const result = await importPositions(id, userId, parsed.data.rows, { replace: parsed.data.replace, prepared })
  await writeDailySnapshot(userId, (await investableTotal(userId)) - before)
  await recordAccountEvent(userId, before, {
    action: "positions_imported",
    accountId: id,
    accountName: account.name,
    detail: {
      rows: parsed.data.rows.length,
      replace: parsed.data.replace,
      imported: result.imported,
      removed: result.removed,
      failed: result.failed.length,
    },
  })

  return NextResponse.json(result, { status: 200 })
}, async (userId, request, { params }) => {
  const { id } = await params
  const account = await requireManualAccount(userId, id)
  if (account.category !== "investment") throw new ApiError("Positions can only be added to investment accounts")
  const parsed = Body.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid import")
  return prepareImportPrices(parsed.data.rows)
})
