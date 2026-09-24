import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { accounts, db } from "@web/db"
import { writeDailySnapshot } from "@web/lib/plaid-sync"
import { ApiError, readJson, withUser } from "@web/lib/api"

type Ctx = { params: Promise<{ id: string }> }

const UpdateAccount = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  institutionLabel: z.string().trim().max(60).nullable().optional(),
  category: z.enum(["investment", "cash", "credit", "loan", "other"]).optional(),
  balance: z.number().finite().nonnegative().optional(),
})

/** Only manual accounts are editable — Plaid balances come from the institution. */
async function requireManualAccount(userId: string, id: string) {
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, id), eq(accounts.userId, userId)),
  })
  if (!account) throw new ApiError("Account not found", 404)
  if (account.source !== "manual") throw new ApiError("Connected accounts are updated from your institution", 409)
  return account
}

export const PATCH = withUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  await requireManualAccount(userId, id)

  const parsed = UpdateAccount.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid update")

  const { balance, ...rest } = parsed.data

  await db
    .update(accounts)
    .set({
      ...rest,
      ...(balance !== undefined ? { currentBalance: balance.toFixed(4) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, id))

  // Re-stamp today so an updated balance is reflected in the series immediately.
  await writeDailySnapshot(userId)

  return NextResponse.json({ ok: true })
})

export const DELETE = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  await requireManualAccount(userId, id)

  await db.delete(accounts).where(eq(accounts.id, id))
  await writeDailySnapshot(userId)

  return NextResponse.json({ ok: true })
})
