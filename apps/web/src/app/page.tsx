import { LandingHeader } from "@web/components/landing/landing-header"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ArrowDown, EyeOff } from "lucide-react"
import { SiteFooter } from "@web/components/site-footer"
import { ChatBubble } from "@web/components/landing/chat-bubble"
import { HeroBackdrop } from "@web/components/landing/hero-backdrop"
import { LeaguePreview } from "@web/components/landing/league-preview"
import { ProductTour } from "@web/components/landing/product-tour"
import { RotatingWord } from "@web/components/landing/rotating-word"
import { SignInButton } from "@web/components/landing/sign-in-button"
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
  { title: "Sign in", body: "Link a brokerage or add what you hold. Or skip it and play fantasy." },
  { title: "Invite your friends", body: "Start a league and share the link. It takes about ten seconds." },
  { title: "See who's ahead", body: "Everyone is ranked on time-weighted return, updated daily." },
]

export default async function HomePage() {
  if (await getCurrentUserId()) redirect("/dashboard")

  return (
    <div className="peerfolio-app pf-landing min-h-screen overflow-x-clip">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <LandingHeader />

      <main className="flex-1">
        <section className="pf-hero relative isolate">
          <HeroBackdrop />
          <div className="mx-auto max-w-5xl px-6 pb-14 pt-16 text-center sm:px-5 sm:pb-16 sm:pt-24">
            <h1 style={revealStyle(0)} className="reveal pf-h1">
              {/* Top line is fixed; the line below is the accent and keeps changing. */}
              Track your investments
              <br />
              <RotatingWord prefix="with " words={RIVALS} />
            </h1>
            <p style={revealStyle(1)} className="reveal pf-sub mx-auto mt-6 max-w-xl text-balance text-base leading-7 sm:text-lg">
              Follow your portfolio, race friends on real returns, or play a fantasy league with play money. Friends see how well you invest, never how much.
            </p>
            <div style={revealStyle(2)} className="reveal mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <SignInButton />
              <a href="#how" className="pf-btn">
                See how it works <ArrowDown className="size-4" aria-hidden />
              </a>
            </div>
            <p style={revealStyle(3)} className="reveal pf-muted mt-4 text-xs">Free to use.</p>
          </div>

          <div className="relative mx-auto max-w-6xl px-6 pb-16 sm:px-5 sm:pb-24 xl:pt-10">
            <ChatBubble from="Theo" className="-top-[74px] left-[5%] -rotate-1" delay={0}>
              NVDA is a personality at this point.
            </ChatBubble>
            <ChatBubble from="Dev" className="-top-[72px] right-[5%] rotate-1" delay={1.5}>
              Down 4.6% and feeling great.
            </ChatBubble>
            <LeaguePreview />
          </div>
        </section>

        <section id="how" className="pf-rule scroll-mt-14">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:px-5 sm:py-24">
            <InView>
              <p className="pf-label-plain pf-tick">What you get</p>
              <h2 className="pf-h2 mt-3 max-w-xl">One app for your money, your friends and the game.</h2>
            </InView>
            <InView index={1} className="mt-10">
              <ProductTour />
            </InView>
            <p className="pf-muted mt-10 text-sm">Also: a daily News tab with the market recap, movers and earnings week.</p>
          </div>
        </section>

        <section className="pf-rule">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 sm:px-5 sm:py-20 lg:grid-cols-[5fr_7fr] lg:gap-14">
            <InView>
              <p className="pf-label-plain pf-tick">How it works</p>
              <h2 className="pf-h2 mt-3">Three steps.</h2>
              <p className="pf-sub mt-5 flex items-start gap-3 text-sm leading-6">
                <EyeOff className="mt-0.5 size-4 shrink-0 text-[var(--pf-accent)]" aria-hidden strokeWidth={1.6} />
                <span>Your league sees your return and, if you choose, your top tickers as a share of your portfolio. Balances stay with you.</span>
              </p>
            </InView>
            <ol className="pf-steps pf-panel grid sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <InView as="li" index={i} key={step.title} className="p-5 sm:p-6">
                  <span className="pf-step-num pf-tick">Step 0{i + 1}</span>
                  <h3 className="mt-5 text-base font-medium">{step.title}</h3>
                  <p className="pf-sub mt-2 text-sm leading-6">{step.body}</p>
                </InView>
              ))}
            </ol>
          </div>
        </section>

        <section className="pf-rule relative isolate overflow-hidden">
          <HeroBackdrop />
          <InView className="mx-auto flex max-w-6xl flex-col items-center px-6 py-20 text-center sm:px-5 sm:py-24">
            <h2 className="pf-h2 text-balance sm:!text-[3rem]">Start your league. <span className="pf-accent italic">Settle the debate.</span></h2>
            <div className="mt-8 w-full sm:w-auto">
              <SignInButton />
            </div>
          </InView>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
