import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { getServerSession } from "next-auth"
import { eq } from "drizzle-orm"
import { db, users } from "@web/db"

/** Derives a stable, readable handle from an email local part. */
function handleFromEmail(email: string): string {
  const base = email.split("@")[0]!.toLowerCase().replace(/[^a-z0-9]/g, "")
  return (base || "investor").slice(0, 20)
}

async function upsertUser(profile: { email: string; name?: string | null; image?: string | null }) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, profile.email) })

  if (existing) {
    await db
      .update(users)
      .set({ name: profile.name ?? existing.name, image: profile.image ?? existing.image, updatedAt: new Date() })
      .where(eq(users.id, existing.id))
    return existing.id
  }

  // Handles are unique; fall back to a suffixed variant on collision.
  const desired = handleFromEmail(profile.email)
  const taken = await db.query.users.findFirst({ where: eq(users.handle, desired) })
  const handle = taken ? `${desired.slice(0, 15)}${Math.floor(1000 + Math.random() * 9000)}` : desired

  const [created] = await db
    .insert(users)
    .values({ email: profile.email, name: profile.name ?? null, image: profile.image ?? null, handle })
    .returning({ id: users.id })

  return created!.id
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  callbacks: {
    /**
     * Mirrors the OAuth profile into our own `users` table and puts that row's
     * id on the token, so every downstream query keys off a real user id
     * rather than an email.
     */
    async jwt({ token, user }) {
      if (user?.email) {
        token.userId = await upsertUser({ email: user.email, name: user.name, image: user.image })
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string
      }
      return session
    },
  },
  pages: { signIn: "/" },
}

/** Returns the signed-in user's id, or null. Use in route handlers. */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}
