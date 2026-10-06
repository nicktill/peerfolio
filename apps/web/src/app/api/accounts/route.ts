import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { accounts, db } from "@web/db"
import { investableTotal, writeDailySnapshot } from "@web/lib/plaid-sync"
import { ApiError, readJson, withUser, withPortfolioUser } from "@web/lib/api"
import { recordAccountEvent } from "@web/lib/account-events"

/**
 * Manual accounts.
 *
 * These exist so people can join leagues and start building snapshot history
 * before their brokerage is connectable — history is the one asset that can't
 * be backfilled later. They're clearly marked `manual` everywhere and are
 * never eligible for the public board.
 */
const ManualAccount = z.object({
  name: z.string().trim().min(1, "Give the account a name").max(60),
  institutionLabel: z.string().trim().max(60).optional(),
  category: z.enum(["investment", "cash", "credit", "loan", "other"]).default("investment"),
  /** Omitted for an account that will be valued from its positions. */
  balance: z.number().finite().nonnegative("Balance can't be negative").default(0),
})

export const GET = withUser<unknown>(async (userId) => {
  const rows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.source, "manual")))

  return NextResponse.json({
    accounts: rows.map((a) => ({
      id: a.id,
      name: a.name,
      institutionLabel: a.institutionLabel,
      category: a.category,
      balance: Number(a.currentBalance ?? 0),
      updatedAt: a.updatedAt,
    })),
  })
})

export const POST = withPortfolioUser<unknown>(async (userId, request) => {
  const parsed = ManualAccount.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid account")

  const { balance, ...rest } = parsed.data

  const before = await investableTotal(userId)

  const [account] = await db
    .insert(accounts)
    .values({
      userId,
      source: "manual",
      itemId: null,
      plaidAccountId: null,
      type: rest.category,
      currentBalance: balance.toFixed(4),
      ...rest,
    })
    .returning()

  await writeDailySnapshot(userId, (await investableTotal(userId)) - before)
  await recordAccountEvent(userId, before, {
    action: "account_created",
    accountId: account!.id,
    accountName: account!.name,
    detail: { category: rest.category, balance },
  })

  return NextResponse.json({ account: { id: account!.id } }, { status: 201 })
})
