import { LandingHeader } from "@web/components/landing/landing-header"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ArrowDown, EyeOff, LineChart, Sparkles, Trophy } from "lucide-react"
import { SiteFooter } from "@web/components/site-footer"
import { ChatBubble } from "@web/components/landing/chat-bubble"
import { HeroBackdrop } from "@web/components/landing/hero-backdrop"
import { HeroProductPreview } from "@web/components/landing/hero-product-preview"
import { ProductTour } from "@web/components/landing/product-tour"
import { RotatingWord } from "@web/components/landing/rotating-word"
import { SmoothScroll } from "@web/components/landing/smooth-scroll"
import { SignInButton } from "@web/components/landing/sign-in-button"
import { InView } from "@web/components/motion/in-view"
import { revealStyle } from "@web/components/motion/reveal"
import { getCurrentUserId } from "@web/lib/auth"
import { SITE } from "@web/lib/site"
import "./landing.css"

// The canonical lives here, not in the layout: every other page would otherwise claim to be the homepage.
export const metadata: Metadata = { alternates: { canonical: "/" } }

/** Tells Google the site's name (so it shows "Peerfolio", not the bare domain) and where it lives. */
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${SITE.baseUrl}/#website`, name: SITE.name, url: SITE.baseUrl, description: SITE.description },
    {
      "@type": "WebApplication",
      name: SITE.name,
      url: SITE.baseUrl,
      description: SITE.description,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
}

const RIVALS = ["friends", "the group chat", "your roommates", "your coworkers", "your dad"] as const

const STEPS = [
  { title: "Add your money", body: "Enter positions by hand or link a brokerage. Or skip it and play a fantasy or sports league." },
  { title: "Invite your friends", body: "Start a league and share the invite link. It takes about ten seconds." },
  { title: "See who's ahead", body: "Investing leagues rank everyone on return in percent, updated daily. Fantasy and sports leagues rank on play money." },
]

export default async function HomePage() {
  if (await getCurrentUserId()) redirect("/dashboard")

  return (
    <div className="peerfolio-app pf-landing min-h-screen overflow-x-clip">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <SmoothScroll />
      <LandingHeader />

      <main className="flex-1">
        <section className="pf-hero relative isolate">
          <HeroBackdrop />
          <div className="pf-hero-copy mx-auto max-w-5xl px-6 pb-8 pt-12 text-center sm:px-5 sm:pb-8 sm:pt-14">
            <p style={revealStyle(0)} className="reveal pf-pill mb-5">
              <i aria-hidden />
              Stocks and sports. Bragging rights on the line.
            </p>
            <h1 style={revealStyle(0)} className="reveal pf-h1">
              {/* Top line is fixed; the line below is the accent and keeps changing. */}
              Track your investments
              <br />
              <RotatingWord prefix="with " words={RIVALS} />
            </h1>
            <p style={revealStyle(1)} className="reveal pf-sub mx-auto mt-4 max-w-2xl text-balance text-base leading-7 sm:text-[17px]">
              <span className="hidden sm:inline">Track your real portfolios, or play for fun with fantasy stocks or sports picks. Compete with friends in leagues where you see return percentages, never dollar amounts.</span>
              <span className="sm:hidden">Track your real portfolios or play for fun. Compete with friends on returns, never dollars.</span>
            </p>
            <div style={revealStyle(2)} className="reveal mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <SignInButton />
              <a href="#how" className="pf-btn hidden sm:inline-flex">
                See how it works <ArrowDown className="size-4" aria-hidden />
              </a>
            </div>
            <ul style={revealStyle(3)} className="reveal pf-modes mt-5" aria-label="Ways to play">
              <li><LineChart aria-hidden />Real portfolios</li>
              <li><Sparkles aria-hidden />Fantasy stocks</li>
              <li><Trophy aria-hidden />Sports picks</li>
            </ul>
            <p style={revealStyle(3)} className="reveal pf-muted mt-3 text-xs">Free. Join friends in a league, or play on your own.</p>
          </div>

          <div className="pf-hero-preview relative mx-auto max-w-[1280px] px-6 pb-16 sm:px-5 sm:pb-24 xl:pt-9">
            <ChatBubble
              side="left"
              className="pf-mobile-bubble -top-[4px] left-[2%] -rotate-3"
              delay={0}
              lines={[
                { memberId: "theo", text: "NVDA carrying me rn 🚀" },
                { memberId: "maya", text: "Dividends hit today. Quietly winning." },
                { memberId: "theo", text: "Who wants to talk about my Friday?" },
              ]}
            />
            <ChatBubble
              side="right"
              className="-top-[4px] right-[2%] rotate-2"
              delay={2.4}
              lines={[
                { memberId: "dev", text: "Down 4.6% and feeling great 🧊" },
                { memberId: "priya", text: "Index funds. See you in 2050." },
                { memberId: "sam", text: "Rebalanced. Again. On a Sunday." },
              ]}
            />
            <HeroProductPreview />
          </div>
        </section>

        <ProductTour />

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
