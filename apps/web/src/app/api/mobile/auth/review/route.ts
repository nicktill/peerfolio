import { NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db, users } from "@web/db"
import { ApiError, readJson, withPublic } from "@web/lib/api"
import { upsertUser } from "@web/lib/auth"
import { ensureDemoUser } from "@web/lib/demo-bootstrap"
import { issueSession, mobileAuthConfig } from "@web/lib/mobile-auth-core"
import { publicUser, refreshStore } from "@web/lib/mobile-auth"
import { enforceMobileLimit } from "@web/lib/mobile-rate-limit"
import { matchesReviewLogin, reviewLoginConfig } from "@web/lib/review-login-core"

const Review = z.object({ email: z.string().min(3).max(200), code: z.string().min(1).max(200) })

/**
 * Sign-in for Apple's App Review team. Answers 404 unless `APP_REVIEW_EMAIL` and `APP_REVIEW_CODE` are both set, so by
 * default the route does not exist. It can only ever sign in that one email, and is limited to 5 attempts per 5 minutes.
 */
export const POST = withPublic<unknown>(async (request) => {
  const review = reviewLoginConfig()
  const config = mobileAuthConfig()
  if (!review || !config) throw new ApiError("Not found", 404)
  await enforceMobileLimit(request, "review")

  const parsed = Review.safeParse(await readJson(request))
  if (!parsed.success || !matchesReviewLogin(review, parsed.data.email, parsed.data.code)) throw new ApiError("That sign-in isn't valid.", 401)

  let userId: string
  if (review.seedDemo) {
    // Adds demo people, a league and a fantasy league around the reviewer. Only enable on a database where that is acceptable.
    const user = await ensureDemoUser(review.email)
    if (!user) throw new ApiError("Review account unavailable", 503)
    userId = user.id
  } else {
    const existing = await db.query.users.findFirst({ where: eq(users.email, review.email) })
    userId = existing?.id ?? (await upsertUser({ email: review.email, name: "App Review" }))
  }

  const session = await issueSession(refreshStore, config, userId)
  return NextResponse.json({ ...session, user: await publicUser(userId) }, { headers: { "Cache-Control": "no-store" } })
})
