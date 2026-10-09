import { NextResponse } from "next/server"
import { CountryCode } from "plaid"
import { and, eq, ne, sql } from "drizzle-orm"
import { db, plaidItems } from "@web/db"
import { encrypt } from "@web/lib/crypto"
import { assertPlaidActive } from "@web/lib/plaid-switch"
import { getPlaidClient, plaidErrorMessage, plaidLinkingEnabled } from "@web/lib/plaid"
import { syncItem } from "@web/lib/plaid-sync"
import { assertBrokeragePermission, reserveProductionLinkAttempt, finishProductionLinkAttempt } from "@web/lib/plaid-access"
import { ApiError, readJson, withUser } from "@web/lib/api"

export const maxDuration = 120

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
  await assertPlaidActive()
  const body = await readJson<Body>(request)
  if (!plaidLinkingEnabled()) throw new ApiError("Brokerage linking is coming soon", 409)
  if (!body || typeof body.publicToken !== "string" || !body.publicToken.trim()) throw new ApiError("publicToken is required")

  const client = getPlaidClient()

  // This reservation commits independently so remote creation cannot outlive our budget accounting.
  const attemptId = await reserveProductionLinkAttempt(userId, body.publicToken)
  let accessToken: string
  let plaidItemId: string
  try {
    // Reservation already committed. Do not hold a DB transaction across remote creation:
    // a later commit failure could otherwise lose the successfully exchanged token.
    await assertBrokeragePermission(userId)
    const { data } = await client.itemPublicTokenExchange({ public_token: body.publicToken })
    accessToken = data.access_token
    plaidItemId = data.item_id
  } catch (error) {
    try { await finishProductionLinkAttempt(attemptId, "uncertain") } catch {
      // The committed reservation still consumes capacity if marking it fails.
      console.error("[plaid] could not finalize failed link reservation", { attemptId, userId })
    }
    if (error instanceof ApiError) throw error
    throw new ApiError(plaidErrorMessage(error), 502)
  }
  try { await finishProductionLinkAttempt(attemptId, "succeeded", plaidItemId) } catch {
    // Do not lose the exchanged token just because the ledger status update failed.
    console.error("[plaid] could not finalize link reservation", { attemptId, plaidItemId, userId })
  }

  // The institution id is authoritative; optional name/logo lookup may fail.
  let institutionName = typeof body.institution?.name === "string" ? body.institution.name : "Connected institution"
  // Never trust a client-supplied institution id for duplicate protection.
  let institutionId: string | null = null
  let institutionLogo: string | null = null

  try {
    const { data: itemData } = await client.itemGet({ access_token: accessToken })
    institutionId = itemData.item.institution_id ?? null
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

  let row
  let removeRejectedItem = false
  try {
    // Know whether cleanup is safe before attempting the lock; lock timeout must
    // not strand a newly created Item, nor remove a known Item during a repair.
    const knownItem = await db.query.plaidItems.findFirst({ where: eq(plaidItems.plaidItemId, plaidItemId) })
    removeRejectedItem = !knownItem
    row = await db.transaction(async (store) => {
      await store.execute(sql`set local lock_timeout = '10s'`)
      await store.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
      const existing = await store.query.plaidItems.findFirst({ where: eq(plaidItems.plaidItemId, plaidItemId) })

      if (existing && existing.userId !== userId) {
        throw new ApiError("This institution is already linked to another account", 409)
      }

      // Never remove a known Item on a failed repair; its stored token remains usable.
      removeRejectedItem = !existing
      // Admin revocation/account deletion while Plaid was open must not create a new local connection.
      await assertBrokeragePermission(userId, store)
      if (!institutionId && !existing) {
        throw new ApiError("Could not verify this brokerage. Please start the connection again shortly.", 502)
      }
      if (!institutionId && existing) {
        institutionId = existing.institutionId
        institutionName = existing.institutionName
        institutionLogo = existing.institutionLogo
      }
      if (!existing && institutionId) {
        const duplicate = await store.query.plaidItems.findFirst({ where: and(
          eq(plaidItems.userId, userId), eq(plaidItems.institutionId, institutionId), ne(plaidItems.status, "disconnected"),
        ) })
        if (duplicate) {
          removeRejectedItem = true
          throw new ApiError("This institution is already connected. Use Reconnect on the existing connection, or disconnect it before linking again.", 409)
        }
      }

      const values = {
        accessToken: encrypt(accessToken), institutionName, institutionId, institutionLogo,
      }
      const [saved] = existing
        ? await store.update(plaidItems).set({ ...values, status: "active", errorCode: null })
            .where(eq(plaidItems.id, existing.id)).returning()
        : await store.insert(plaidItems).values({ ...values, userId, plaidItemId }).returning()
      return saved!

    })
  } catch (error) {
    if (removeRejectedItem) {
      // This new Item must not remain live and billable after being rejected locally.
      try { await client.itemRemove({ access_token: accessToken }) } catch {
        console.error("[plaid] remote cleanup failed", { plaidItemId, userId })
        throw new ApiError("Connection could not be saved, and Plaid cleanup failed. Contact support before retrying.", 502)
      }
    }
    throw error
  }

  const result = await syncItem(row!.id)

  return NextResponse.json({
    item: {
      id: row!.id,
      institutionName,
      institutionLogo,
      status: result.status,
      errorCode: result.errorCode ?? null,
      accounts: result.accounts,
      holdings: result.holdings,
    },
  })
})
