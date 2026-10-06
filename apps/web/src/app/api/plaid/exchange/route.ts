import { NextResponse } from "next/server"
import { CountryCode } from "plaid"
import { eq } from "drizzle-orm"
import { db, plaidItems, withPortfolioWrite } from "@web/db"
import { encrypt } from "@web/lib/crypto"
import { getPlaidClient, plaidErrorMessage } from "@web/lib/plaid"
import { investableTotal, prepareItem, applyPreparedItem, writeDailySnapshot } from "@web/lib/plaid-sync"
import { ApiError, readJson, withUser } from "@web/lib/api"

type Body = {
  publicToken?: string
  institution?: { name?: string; institution_id?: string }
}

/**
 * Exchanges a public token and stores the resulting access token encrypted,
 * server-side. The access token is never part of the response — the client
 * only ever learns our own item row id.
 */
export const POST = withUser<unknown>(async (userId, request) => {
  const body = await readJson<Body>(request)
  if (!body.publicToken) throw new ApiError("publicToken is required")

  const client = getPlaidClient()

  let accessToken: string
  let plaidItemId: string
  try {
    const { data } = await client.itemPublicTokenExchange({ public_token: body.publicToken })
    accessToken = data.access_token
    plaidItemId = data.item_id
  } catch (error) {
    throw new ApiError(plaidErrorMessage(error), 502)
  }

  // Institution metadata is best-effort; a failure here shouldn't lose the connection.
  let institutionName = body.institution?.name ?? "Connected institution"
  let institutionId = body.institution?.institution_id ?? null
  let institutionLogo: string | null = null

  try {
    const { data: itemData } = await client.itemGet({ access_token: accessToken })
    institutionId = itemData.item.institution_id ?? institutionId
    if (institutionId) {
      const { data: inst } = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
        options: { include_optional_metadata: true },
      })
      institutionName = inst.institution.name ?? institutionName
      institutionLogo = inst.institution.logo ? `data:image/png;base64,${inst.institution.logo}` : null
    }
  } catch {
    // Keep the metadata we already have from Link.
  }

  const existing = await db.query.plaidItems.findFirst({ where: eq(plaidItems.plaidItemId, plaidItemId) })

  if (existing && existing.userId !== userId) {
    throw new ApiError("This institution is already linked to another account", 409)
  }

  const [row] = existing
    ? await db
        .update(plaidItems)
        .set({
          accessToken: encrypt(accessToken),
          flowsNeedBaseline: existing.flowsNeedBaseline,
          institutionName,
          institutionId,
          institutionLogo,
          status: "active",
          errorCode: null,
        })
        .where(eq(plaidItems.id, existing.id))
        .returning()
    : await db
        .insert(plaidItems)
        .values({
          userId,
          plaidItemId,
          accessToken: encrypt(accessToken),
          flowsNeedBaseline: true,
          flowBaselineDate: new Date().toISOString().slice(0, 10),
          institutionName,
          institutionId,
          institutionLogo,
        })
        .returning()

  const prepared = await prepareItem(row!.id)
  const result = await withPortfolioWrite(userId, async () => {
    const before = await investableTotal(userId)
    const result = await applyPreparedItem(prepared)
    if (result.status === "active") await db.update(plaidItems).set({ flowsNeedBaseline: false }).where(eq(plaidItems.id, row!.id))
    await writeDailySnapshot(userId, (await investableTotal(userId)) - before)
    return result
  })

  return NextResponse.json({
    item: {
      id: row!.id,
      institutionName,
      institutionLogo,
      status: result.status,
      accounts: result.accounts,
      holdings: result.holdings,
    },
  })
})
