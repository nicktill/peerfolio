import { NextResponse } from "next/server"
import { withUser } from "@web/lib/api"
import { cancelOrder } from "@web/lib/fantasy"

type Ctx = { params: Promise<{ id: string; orderId: string }> }

/** Cancels one of your orders that is still waiting for the open. */
export const DELETE = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id, orderId } = await params
  return NextResponse.json(await cancelOrder(userId, id, orderId))
})
