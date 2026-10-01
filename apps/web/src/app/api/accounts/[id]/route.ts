import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { accounts, db } from "@web/db"
import { investableTotal, writeDailySnapshot } from "@web/lib/plaid-sync"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { accountHasPositions, requireManualAccount } from "@web/lib/positions"
import { recordAccountEvent } from "@web/lib/account-events"

type Ctx = { params: Promise<{ id: string }> }

const UpdateAccount = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  institutionLabel: z.string().trim().max(60).nullable().optional(),
  category: z.enum(["investment", "cash", "credit", "loan", "other"]).optional(),
  balance: z.number().finite().nonnegative().optional(),
})

export const PATCH = withUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const account = await requireManualAccount(userId, id)

  const before = await investableTotal(userId)
  const parsed = UpdateAccount.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid update")

  const { balance, ...rest } = parsed.data
  // A positions account's value comes from market prices, and positions only
  // make sense in an investment account.
  if ((balance !== undefined || rest.category !== undefined) && (await accountHasPositions(id))) {
    throw new ApiError("This account is valued from its positions", 409)
  }

  await db
    .update(accounts)
    .set({
      ...rest,
      ...(balance !== undefined ? { currentBalance: balance.toFixed(4) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, id))

  // Re-stamp today so an updated balance shows immediately. The delta counts
  // as a flow: a typed-in number can't be distinguished from a correction.
  await writeDailySnapshot(userId, (await investableTotal(userId)) - before)
  await recordAccountEvent(userId, before, {
    action: "account_updated",
    accountId: id,
    accountName: rest.name ?? account.name,
    detail: {
      ...rest,
      balanceBefore: balance !== undefined ? Number(account.currentBalance ?? 0) : undefined,
      balanceAfter: balance,
    },
  })

  return NextResponse.json({ ok: true })
})

export const DELETE = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  const account = await requireManualAccount(userId, id)

  const beforeDelete = await investableTotal(userId)
  await db.delete(accounts).where(eq(accounts.id, id))
  await writeDailySnapshot(userId, (await investableTotal(userId)) - beforeDelete)
  await recordAccountEvent(userId, beforeDelete, {
    action: "account_deleted",
    accountId: id,
    accountName: account.name,
    detail: { category: account.category, balance: Number(account.currentBalance ?? 0) },
  })

  return NextResponse.json({ ok: true })
})
