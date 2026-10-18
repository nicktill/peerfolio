import { inviteMetadata } from "@web/lib/invite-metadata"
import { LeagueMark } from "@web/components/league/league-mark"
import Image from "next/image"
import Link from "next/link"
import { db } from "@web/lib/sports/api"
import { previewSportsLeague } from "@web/lib/sports/store"
import { sportsEnabled } from "@web/lib/sports/flag"
import { HeroBackdrop } from "@web/components/landing/hero-backdrop"
import { LeagueBrand } from "@web/components/sports/league-brand"
import { JoinSports } from "./join-sports"

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  return inviteMetadata("sports", (await params).code)
}

/** Sports invite landing page. Shows the same name and size the other invite pages show, before sign-in. */
export default async function JoinSportsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const normalized = code.trim().toUpperCase()
  const league = sportsEnabled() ? await previewSportsLeague(db, normalized) : null

  return (
    <main className="relative isolate mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <HeroBackdrop />
      <Link href="/" className="mb-10 flex items-center gap-2 self-start">
        <span className="grid size-7 place-items-center rounded-lg bg-white shadow-sm ring-1 ring-border">
          <Image src="/logo.png" alt="" width={20} height={20} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Peerfolio</span>
      </Link>

      {!league ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">That invite isn&apos;t valid</h1>
          <p className="mt-2 text-sm text-muted-foreground">The code may be mistyped, or the league has finished.</p>
        </>
      ) : (
        <div className="rounded-3xl border bg-card/80 p-6 shadow-xl backdrop-blur">
          <LeagueMark value={league.emoji} accent={league.accent} size={64} />
          <p className="mt-4 text-sm font-semibold text-primary">You&apos;ve been invited</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{league.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {league.memberCount} {league.memberCount === 1 ? "player" : "players"} · {league.startingCredits.toLocaleString("en-US")} play credits each
          </p>
          {league.sports?.length ? <p className="mt-3 flex flex-wrap items-center gap-2" aria-label="Leagues">{league.sports.map((s: string) => <LeagueBrand key={s} sport={s} iconOnly />)}</p> : null}
          <JoinSports code={normalized} leagueName={league.name} />
        </div>
      )}
    </main>
  )
}
