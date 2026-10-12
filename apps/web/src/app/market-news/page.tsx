import type { Metadata } from "next"
import { LandingHeader } from "@web/components/landing/landing-header"
import { NewsBoard } from "@web/components/news/news-board"
import "@web/app/landing.css"

export const metadata: Metadata = { title: "Market news | Peerfolio", description: "Market moves, the daily briefing and upcoming earnings. Read public market news without signing in." }

/** Public market information only; no session, holdings or account lookup. */
export default function MarketNewsPage() {
  return <div className="peerfolio-app pf-landing min-h-screen"><LandingHeader /><main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6"><NewsBoard holdingMoves={[]} /></main></div>
}
