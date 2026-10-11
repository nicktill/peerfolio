import { LandingHeader } from "@web/components/landing/landing-header"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ArrowDown, EyeOff, PenLine, Scale } from "lucide-react"
import { SiteFooter } from "@web/components/site-footer"
import { BoardPreview } from "@web/components/landing/board-preview"
import { ChatBubble } from "@web/components/landing/chat-bubble"
import { HeroBackdrop } from "@web/components/landing/hero-backdrop"
import { LeaguePreview } from "@web/components/landing/league-preview"
import { RotatingWord } from "@web/components/landing/rotating-word"
import { SignInButton } from "@web/components/landing/sign-in-button"
import { TickerTape } from "@web/components/landing/ticker-tape"
import { InView } from "@web/components/motion/in-view"
import { revealStyle } from "@web/components/motion/reveal"
import { getCurrentUserId } from "@web/lib/auth"
import { SITE } from "@web/lib/site"
import "./landing.css"

// The canonical lives here, not in the layout: every other page would otherwise claim to be the homepage.
export const metadata: Metadata = { alternates: { canonical: "/" } }

/** Tells Google the site's name (so it shows "Peerfolio", not the bare domain) and where it lives. */
const structuredData = { "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, url: SITE.baseUrl, description: SITE.description }

const RIVALS = ["friends", "the group chat", "your roommates", "your coworkers", "your dad"] as const

const STEPS = [
  { title: "Start a league", body: "Name it, pick an emoji, get an invite link. Takes about ten seconds." },
  { title: "Drop it in the group chat", body: "Everyone types in what they hold, or runs a fantasy portfolio with play money. It takes a minute." },
  { title: "Settle it with math", body: "Everyone is ranked by time-weighted return, updated daily. Receipts included." },
]

const POINTS = [
  {
    icon: EyeOff,
    title: "Percentages, never dollars",
    body: "Your league sees your return and, if you like, your top tickers as a share of your portfolio. Balances and position sizes stay with you.",
  },
  {
    icon: Scale,
    title: "Deposits don't count",
    body: "Returns are time-weighted. Adding cash or linking a new account doesn't move your number. Only your picks do.",
  },
  {
    icon: PenLine,
    title: "Type it in, we track it",
    body: "Add your positions by hand and we price them every night from market data. Read-only brokerage linking is coming soon.",
  },
]

export default async function HomePage() {
  if (await getCurrentUserId()) redirect("/dashboard")

  return (
    <div className="peerfolio-app pf-landing min-h-screen overflow-x-clip">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <LandingHeader />

      <main className="flex-1">
        <section className="relative isolate">
          <HeroBackdrop />
          <div className="mx-auto max-w-5xl px-6 pb-16 pt-20 text-center sm:px-5 sm:pt-32">
            <span className="reveal pf-pill" style={revealStyle(0)}>
              <i aria-hidden />
              <span>Season&apos;s live. Bragging rights on the line.</span>
            </span>
            <h1 style={revealStyle(1)} className="reveal pf-h1 mt-7">
              {/* Top line is fixed; the line below is the accent and keeps changing. */}
              Track your investments
              <br />
              <RotatingWord prefix="with " words={RIVALS} />
            </h1>
            <p style={revealStyle(2)} className="reveal pf-sub mx-auto mt-6 max-w-md text-balance text-base leading-7 sm:text-lg">
              Private leagues ranked on returns. Friends see how well you invest, never how much.
            </p>
            <div style={revealStyle(3)} className="reveal mt-9 flex flex-wrap justify-center gap-3">
              <SignInButton />
              <a href="#how" className="pf-btn">
                See how it works <ArrowDown className="size-4" aria-hidden />
              </a>
            </div>
            <p style={revealStyle(4)} className="reveal pf-muted mt-4 text-xs">Free. Add your positions by hand, or play with fantasy money.</p>
          </div>

          <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
            <ChatBubble from="Maya" className="-top-14 left-8 -rotate-2" delay={0}>
              NVDA carrying me rn 🚀
            </ChatBubble>
            <ChatBubble from="DeShawn" className="-top-16 right-10 rotate-2" delay={1.5}>
              index funds and chill 🧊 see you at the finish
            </ChatBubble>
            <ChatBubble from="Jordan" className="-bottom-8 left-[38%] -rotate-1" delay={3}>
              who let me buy the dip again 😭
            </ChatBubble>
            <div className="pf-frame">
              <LeaguePreview />
            </div>
          </div>
        </section>

        <div className="mt-20 sm:mt-28">
          <TickerTape />
        </div>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-5 sm:py-28">
          <InView>
            <p className="pf-label-plain pf-tick">How it works</p>
            <h2 className="pf-h2 mt-3 max-w-xl">Your group chat already argues about stocks. Now it keeps score.</h2>
          </InView>
          <ol className="pf-steps pf-panel mt-12 grid sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <InView as="li" index={i} key={step.title} className="p-6 sm:p-7">
                <span className="pf-step-num pf-tick">Step 0{i + 1}</span>
                <h3 className="mt-6 text-base font-medium">{step.title}</h3>
                <p className="pf-sub mt-2 text-sm leading-6">{step.body}</p>
              </InView>
            ))}
          </ol>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-3 sm:px-5 sm:pb-28">
          {POINTS.map((point, i) => (
            <InView key={point.title} index={i} className="pf-panel p-6">
              <span className="pf-icon" aria-hidden>
                <point.icon className="size-[16px]" strokeWidth={1.6} />
              </span>
              <h3 className="mt-5 text-base font-medium">{point.title}</h3>
              <p className="pf-sub mt-2 text-sm leading-6">{point.body}</p>
            </InView>
          ))}
        </section>

        <section className="pf-rule">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-5 sm:py-28 lg:grid-cols-2 lg:gap-20">
            <InView>
              <p className="pf-label-plain pf-tick">The public board</p>
              <h2 className="pf-h2 mt-3">Verified or it didn&apos;t happen.</h2>
              <p className="pf-sub mt-5 leading-7">
                Opt in and your return goes up against everyone&apos;s. Only portfolios pulled straight from a brokerage
                are ranked, and only after a week of history, so nobody tops it with a typo or one lucky day.
              </p>
              <p className="pf-muted mt-3 text-sm">Opens when brokerage linking launches.</p>
            </InView>
            <InView index={1} className="pf-frame">
              <BoardPreview />
            </InView>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-5 sm:pb-28">
          <InView className="pf-panel p-6 sm:p-12">
            <p className="pf-label-plain pf-tick">Fantasy leagues</p>
            <h2 className="pf-h2 mt-3 max-w-xl">Draft day for <span className="pf-accent italic">stocks.</span></h2>
            <p className="pf-sub mt-4 max-w-2xl leading-7">
              Everyone gets the same $100k of play money. Pick your stocks, set a deadline or let it run forever, and
              find out who actually knows what they&apos;re doing. No brokerage needed.
            </p>
            <div className="mt-7">
              <SignInButton />
            </div>
          </InView>
        </section>

        <section className="pf-rule relative isolate overflow-hidden">
          <HeroBackdrop />
          <InView className="mx-auto flex max-w-6xl flex-col items-center px-6 py-24 text-center sm:px-5 sm:py-32">
            <h2 className="pf-h2 text-balance sm:!text-[3.25rem]">Start your league. <span className="pf-accent italic">Settle the debate.</span></h2>
            <p className="pf-sub mt-4">Your history starts the day you join. So does the trash talk.</p>
            <div className="mt-9">
              <SignInButton />
            </div>
          </InView>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
