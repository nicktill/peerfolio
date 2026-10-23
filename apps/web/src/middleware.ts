import { NextResponse, type NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

/**
 * Signed-in visitors to the landing page go to their dashboard. Doing it here, from the session
 * token alone, lets the landing page itself be static: rendering it per visit (to read the session)
 * was one of the costliest routes in function CPU. The token carries the same `userId` that
 * `getCurrentUserId` reads, so the two agree on who is signed in.
 */
export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET }).catch(() => null)
  if (token?.userId) return NextResponse.redirect(new URL("/dashboard", request.url))
  return NextResponse.next()
}

export const config = { matcher: "/" }
