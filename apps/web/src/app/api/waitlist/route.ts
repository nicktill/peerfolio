import { NextResponse } from "next/server"
import { z } from "zod"
import { db, waitlistSignups } from "@web/db"
import { ApiError, readJson, withPublic } from "@web/lib/api"

const Signup = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  name: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
  source: z.string().trim().max(40).optional(),
})

/** Persists a waitlist signup. Re-submitting the same email is a no-op. */
export const POST = withPublic<unknown>(async (request) => {
  const parsed = Signup.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid signup")

  await db.insert(waitlistSignups).values(parsed.data).onConflictDoNothing({ target: waitlistSignups.email })

  return NextResponse.json({ ok: true })
})
