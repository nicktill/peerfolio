import { LandingHeader } from "@web/components/landing/landing-header"
import { redirect } from "next/navigation"
import { ArrowDown, Sparkles } from "lucide-react"
import { SiteFooter } from "@web/components/site-footer"
import { BoardPreview } from "@web/components/landing/board-preview"
import { ChatBubble } from "@web/components/landing/chat-bubble"
import { HeroBackdrop } from "@web/components/landing/hero-backdrop"
import { LeaguePreview } from "@web/components/landing/league-preview"
import { RotatingWord } from "@web/components/landing/rotating-word"
import { SignInButton } from "@web/components/landing/sign-in-button"
import { TickerTape } from "@web/components/landing/ticker-tape"
import { getCurrentUserId } from "@web/lib/auth"

const RIVALS = ["friends", "the group chat", "your roommates", "your coworkers", "your dad"] as const

const STEPS = [
  { title: "Start a league", body: "Name it, pick an emoji, get an invite link. Takes about ten seconds." },
  { title: "Drop it in the group chat", body: "Everyone types in what they hold, or runs a fantasy portfolio with play money. It takes a minute." },
  { title: "Settle it with math", body: "Everyone is ranked by time-weighted return, updated daily. Receipts included." },
]

const POINTS = [
  {
    emoji: "🙈",
    title: "Percentages, never dollars",
    body: "Your league sees your return and, if you like, your top tickers as a share of your portfolio. Balances and position sizes stay with you.",
  },
  {
    emoji: "⚖️",
    title: "Deposits don't count",
    body: "Returns are time-weighted. Adding cash or linking a new account doesn't move your number. Only your picks do.",
  },
  {
    emoji: "✍️",
    title: "Type it in, we track it",
    body: "Add your positions by hand and we price them every night from market data. Read-only brokerage linking is coming soon.",
  },
]

export default async function HomePage() {
  if (await getCurrentUserId()) redirect("/dashboard")

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <LandingHeader />

      <main className="flex-1">
        <section className="relative isolate">
          <HeroBackdrop />
          <div className="mx-auto max-w-4xl px-4 pb-14 pt-28 text-center sm:pt-40">
            <span className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--gain)] opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-[var(--gain)]" />
              </span>
              Season&apos;s live. Bragging rights on the line.
            </span>
            <h1 className="mt-6 text-balance text-[2.6rem] font-semibold leading-[1.05] tracking-tight sm:text-7xl">
              Compete with
              <br />
              <RotatingWord words={RIVALS} />
            </h1>
            <p className="mx-auto mt-6 max-w-md text-balance text-base text-muted-foreground sm:text-lg">
              Private leagues ranked on returns. Friends see how well you invest, never how much.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <SignInButton />
              <a
                href="#how"
                className="inline-flex h-11 items-center gap-2 rounded-full border bg-card px-5 text-sm font-medium transition-colors hover:bg-secondary"
              >
                See how it works <ArrowDown className="size-4" aria-hidden />
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Free. Add your positions by hand, or play with fantasy money.</p>
          </div>

          <div className="relative mx-auto max-w-6xl px-4">
            <ChatBubble from="Maya" className="-top-7 left-8 -rotate-2" delay={0}>
              NVDA carrying me rn 🚀
            </ChatBubble>
            <ChatBubble from="DeShawn" className="-top-9 right-10 rotate-2" delay={1.5}>
              index funds and chill 🧊 see you at the finish
            </ChatBubble>
            <ChatBubble from="Jordan" className="-bottom-8 left-[38%] -rotate-1" delay={3}>
              who let me buy the dip again 😭
            </ChatBubble>
            <div className="rounded-3xl border bg-card/40 p-2 shadow-2xl shadow-primary/10 backdrop-blur sm:p-4">
              <LeaguePreview />
            </div>
          </div>
        </section>

        <div className="mt-16 sm:mt-24">
          <TickerTape />
        </div>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:py-24">
          <p className="text-sm font-semibold text-primary">How it works</p>
          <h2 className="mt-2 max-w-xl text-balance text-3xl font-semibold tracking-tight">
            Your group chat already argues about stocks. Now it keeps score.
          </h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="group rounded-2xl border bg-card p-6 transition-colors hover:border-primary/40">
                <span className="numeric font-mono text-4xl font-semibold text-primary/30 transition-colors group-hover:text-primary">
                  0{i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 sm:grid-cols-3 sm:pb-24">
          {POINTS.map((point) => (
            <div key={point.title}>
              <span className="grid size-10 place-items-center rounded-xl bg-secondary text-xl" aria-hidden>
                {point.emoji}
              </span>
              <h3 className="mt-4 font-semibold">{point.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{point.body}</p>
            </div>
          ))}
        </section>

        <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-16 sm:pb-24 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-sm font-semibold text-primary">The public board</p>
            <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight">
              Verified or it didn&apos;t happen.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Opt in and your return goes up against everyone&apos;s. Only portfolios pulled straight from a brokerage
              are ranked, and only after a week of history, so nobody tops it with a typo or one lucky day.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">Opens when brokerage linking launches.</p>
          </div>
          <div className="rounded-3xl border bg-secondary/60 p-2 sm:p-4">
            <BoardPreview />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:pb-24">
          <div className="relative overflow-hidden rounded-3xl border border-primary/40 bg-accent/40 p-8 sm:p-12">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
              <Sparkles className="size-3.5" aria-hidden /> New
            </span>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight">Fantasy leagues. Draft day for stocks.</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Everyone gets the same $100k of play money. Pick your stocks, set a deadline or let it run forever, and
              find out who actually knows what they&apos;re doing. No brokerage needed.
            </p>
            <div className="relative mt-6">
              <SignInButton />
            </div>
            <span aria-hidden className="absolute -right-4 -top-6 select-none text-[9rem] leading-none opacity-15 sm:text-[12rem]">
              🏈
            </span>
          </div>
        </section>

        <section className="relative isolate overflow-hidden border-t">
          <HeroBackdrop />
          <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-20 text-center sm:py-28">
            <p className="text-4xl" aria-hidden>🏆</p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-5xl">Start your league. Settle the debate.</h2>
            <p className="mt-3 text-muted-foreground">Your history starts the day you join. So does the trash talk.</p>
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
