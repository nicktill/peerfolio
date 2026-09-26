import Image from "next/image"
import { redirect } from "next/navigation"
import { SiteFooter } from "@web/components/site-footer"
import { BoardPreview } from "@web/components/landing/board-preview"
import { LeaguePreview } from "@web/components/landing/league-preview"
import { SignInButton } from "@web/components/landing/sign-in-button"
import { getCurrentUserId } from "@web/lib/auth"

const POINTS = [
  {
    title: "Percentages, never dollars",
    body: "Your league sees your return and, if you like, your top tickers as a share of your portfolio. Balances and position sizes stay with you.",
  },
  {
    title: "Deposits don't count",
    body: "Returns are time-weighted. Adding cash or linking a new account doesn't move your number. Only your investments do.",
  },
  {
    title: "Link it or type it",
    body: "Connect a brokerage through Plaid, read-only, or add an account by hand. Either way it's tracked daily.",
  },
]

export default async function HomePage() {
  if (await getCurrentUserId()) redirect("/dashboard")

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4">
        <span className="flex items-center gap-2">
          <Image src="/logo.png" alt="" width={26} height={26} className="rounded-md" priority />
          <span className="text-[15px] font-semibold tracking-tight">Peerfolio</span>
        </span>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 pb-12 pt-12 text-center sm:pt-20">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Compete with friends on returns. Keep the dollars to yourself.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Private leagues rank everyone by time-weighted return. Your friends see how well you invest, never how much
            you have.
          </p>
          <div className="mt-8 flex justify-center">
            <SignInButton />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4" aria-label="A league in Peerfolio">
          <div className="rounded-3xl border bg-secondary/60 p-2 sm:p-4">
            <LeaguePreview />
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-3 sm:py-24">
          {POINTS.map((point) => (
            <div key={point.title}>
              <h2 className="font-semibold">{point.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{point.body}</p>
            </div>
          ))}
        </section>

        <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-16 sm:pb-24 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-balance text-3xl font-semibold tracking-tight">The board is verified or it&apos;s not on it.</h2>
            <p className="mt-4 text-muted-foreground">
              Opt in and your return goes up against everyone&apos;s. Only portfolios pulled straight from a brokerage
              are ranked, and only after a week of history, so nobody tops it with a typo or one lucky day.
            </p>
          </div>
          <div className="rounded-3xl border bg-secondary/60 p-2 sm:p-4">
            <BoardPreview />
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-16 text-center sm:py-24">
            <h2 className="text-balance text-3xl font-semibold tracking-tight">Start your league.</h2>
            <p className="mt-3 text-muted-foreground">Your history starts the day you join.</p>
            <div className="mt-8">
              <SignInButton />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
