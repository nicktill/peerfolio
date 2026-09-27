import { NextResponse } from "next/server"
import { CountryCode, Products } from "plaid"
import { and, eq } from "drizzle-orm"
import { db, plaidItems } from "@web/db"
import { decrypt } from "@web/lib/crypto"
import { getPlaidClient, plaidErrorMessage, plaidLinkingEnabled } from "@web/lib/plaid"
import { ApiError, readJson, withUser } from "@web/lib/api"

type Body = { itemId?: string }

/**
 * Creates a Link token for the signed-in user.
 *
 * Passing `itemId` puts Link into update mode so an item flagged
 * `needs_reauth` can be repaired without creating a duplicate connection.
 */
export const POST = withUser<unknown>(async (userId, request) => {
  const body = await readJson<Body>(request).catch(() => ({}) as Body)
  // Repairing an existing connection stays possible; new ones wait for production.
  if (!body.itemId && !plaidLinkingEnabled()) throw new ApiError("Brokerage linking is coming soon", 409)
  const client = getPlaidClient()

  let accessToken: string | undefined
  if (body.itemId) {
    const item = await db.query.plaidItems.findFirst({
      where: and(eq(plaidItems.id, body.itemId), eq(plaidItems.userId, userId)),
    })
    if (!item) throw new ApiError("Connection not found", 404)
    accessToken = decrypt(item.accessToken)
  }

  try {
    const { data } = await client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Peerfolio",
      language: "en",
      country_codes: [CountryCode.Us],
      // Update mode rejects `products`; the item keeps the ones it was created with.
      ...(accessToken
        ? { access_token: accessToken }
        : { products: [Products.Investments] }),
      ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
      ...(process.env.PLAID_WEBHOOK_URL ? { webhook: process.env.PLAID_WEBHOOK_URL } : {}),
    })

    return NextResponse.json({ linkToken: data.link_token, expiration: data.expiration })
  } catch (error) {
    throw new ApiError(plaidErrorMessage(error), 502)
  }
})
