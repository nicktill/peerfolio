import { inviteMetadata } from "@web/lib/invite-metadata"
import { eq, sql } from "drizzle-orm"
import Image from "next/image"
import Link from "next/link"
import { db, leagueMembers, leagues } from "@web/db"
import { JoinLeague } from "./join-league"

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  return inviteMetadata("league", (await params).code)
}

/**
 * Invite landing page.
 *
 * Holding the code is the permission, so the league's name and size are shown
 * before sign-in — an invite you can't identify isn't an invite. Nothing about
 * members or their returns is exposed until you're actually in.
 */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const normalized = code.trim().toUpperCase()

  const league = await db.query.leagues.findFirst({ where: eq(leagues.inviteCode, normalized) })

  const memberCount = league
    ? ((
        await db
          .select({ count: sql<number>`count(*)::int` })
          .from(leagueMembers)
          .where(eq(leagueMembers.leagueId, league.id))
      )[0]?.count ?? 0)
    : 0

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-10 flex items-center gap-2 self-start">
        <Image src="/logo.png" alt="" width={26} height={26} className="rounded-md" />
        <span className="text-[15px] font-semibold tracking-tight">Peerfolio</span>
      </Link>

      {!league || league.isArchived ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">That invite isn&apos;t valid</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The code may have been mistyped, or the league is closed. Ask whoever invited you for a fresh link.
          </p>
        </>
      ) : (
        <>
          <span className="text-4xl" aria-hidden>
            {league.emoji}
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            You&apos;re invited to {league.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {league.description ? `${league.description} · ` : ""}
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Leagues compare percentage returns. Nobody sees anyone&apos;s balances — not yours, not theirs.
          </p>

          <JoinLeague code={normalized} leagueName={league.name} />
        </>
      )}
    </main>
  )
}
