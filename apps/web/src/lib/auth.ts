import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { getServerSession } from "next-auth"
import { eq } from "drizzle-orm"
import { db, users } from "@web/db"
import { ensureDemoUser } from "@web/lib/demo-bootstrap"
import { devLoginMode, passcodeMatches, previewAllowlist } from "@web/lib/dev-login"

/**
 * Seeds a handle from the display name, never the email.
 *
 * The name is already shown publicly; an email local part is not, and
 * publishing it would contradict what Settings promises. This is only a
 * starting point — people can change it, and the suffix keeps it unguessable
 * enough that a collision doesn't hand someone else's identity away.
 */
function seedHandle(name: string | null | undefined): string {
  const base = (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)
  const suffix = Math.floor(1000 + Math.random() * 9000)
  return `${base || "investor"}${suffix}`
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

  // Handles are unique; retry on the (unlikely) collision.
  let handle = seedHandle(profile.name)
  while (await db.query.users.findFirst({ where: eq(users.handle, handle) })) {
    handle = seedHandle(profile.name)
  }

  const [created] = await db
    .insert(users)
    .values({ email: profile.email, name: profile.name ?? null, image: profile.image ?? null, handle })
    .returning({ id: users.id })

  return created!.id
}

/**
 * Sign in as an existing user without configuring an OAuth app.
 *
 * `devLoginMode` decides where it may run: locally with just the opt-in flag, or on a Vercel
 * *preview* with a passcode and an allowlist of accounts, and never in production. It only
 * matches users that already exist, so it can't be used to mint new accounts.
 */
const devLoginProvider = CredentialsProvider({
  id: "dev-login",
  name: "Developer login",
  credentials: { email: { label: "Email", type: "email" }, passcode: { label: "Passcode", type: "password" } },
  async authorize(credentials) {
    // Checked on every attempt, not once at startup, so no stale module state can leave it on.
    const mode = devLoginMode()
    if (mode === "off") return null

    const email = credentials?.email?.trim().toLowerCase()
    if (!email) return null

    if (mode === "preview" && (!passcodeMatches(credentials?.passcode) || !previewAllowlist().includes(email))) return null

    let user = await db.query.users.findFirst({ where: eq(users.email, email) })
    // A preview's demo database may be empty. The passcode and allowlist already passed, so build
    // the demo account on first use instead of making someone run the seed script.
    if (!user && mode === "preview") {
      try {
        user = await ensureDemoUser(email)
      } catch (error) {
        console.error("Demo account setup failed", error)
        return null
      }
    }
    if (!user) return null

    return { id: user.id, email: user.email, name: user.name, image: user.image }
  },
})

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    ...(devLoginMode() !== "off" ? [devLoginProvider] : []),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  callbacks: {
    /**
     * Mirrors the OAuth profile into our own `users` table and puts that row's
     * id on the token, so every downstream query keys off a real user id
     * rather than an email.
     */
    async jwt({ token, user, account }) {
      if (!user?.email) return token

      // Dev login resolved an existing row, so there is nothing to upsert.
      token.userId =
        account?.provider === "dev-login"
          ? user.id
          : await upsertUser({ email: user.email, name: user.name, image: user.image })

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
