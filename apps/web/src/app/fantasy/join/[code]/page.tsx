import Image from "next/image"
import Link from "next/link"
import { previewFantasyLeague } from "@web/lib/fantasy"
import { formatCurrency } from "@web/lib/format"
import { HeroBackdrop } from "@web/components/landing/hero-backdrop"
import { JoinFantasy } from "./join-fantasy"

/** Invite landing page. Holding the code is the permission to see the league's name. */
export default async function JoinFantasyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const normalized = code.trim().toUpperCase()
  const league = await previewFantasyLeague(normalized)
  const closed = league?.endsAt ? league.endsAt.getTime() <= Date.now() : false

  return (
    <main className="relative isolate mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <HeroBackdrop />
      <Link href="/" className="mb-10 flex items-center gap-2 self-start">
        <span className="grid size-7 place-items-center rounded-lg bg-white shadow-sm ring-1 ring-border">
          <Image src="/logo.png" alt="" width={20} height={20} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Peerfolio</span>
      </Link>

      {!league || closed ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">That invite isn&apos;t valid</h1>
          <p className="mt-2 text-sm text-muted-foreground">The code may be mistyped, or the league has finished.</p>
        </>
      ) : (
        <div className="rounded-3xl border bg-card/80 p-6 shadow-xl backdrop-blur">
          <span className="text-5xl" aria-hidden>{league.emoji}</span>
          <p className="mt-4 text-sm font-semibold text-primary">You&apos;ve been drafted</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{league.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {league.memberCount} {league.memberCount === 1 ? "player" : "players"} · {formatCurrency(league.startingCash)} of play money each
            {league.endsAt ? ` · ends ${league.endsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : " · all-time"}
          </p>
          <JoinFantasy code={normalized} leagueName={league.name} />
        </div>
      )}
    </main>
  )
}
