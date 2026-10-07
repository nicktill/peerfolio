import { NextResponse } from "next/server"
import { withUser } from "@web/lib/api"
import { getBrokerageAccess } from "@web/lib/plaid-access"

export const GET = withUser<unknown>(async (userId) => NextResponse.json(await getBrokerageAccess(userId)))
