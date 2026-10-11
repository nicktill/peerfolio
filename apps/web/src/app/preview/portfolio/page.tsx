import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AppNav } from "@web/components/app-nav"
import { DemoPortfolio } from "@web/components/dashboard/demo-portfolio"

export const metadata: Metadata = { title: "Portfolio preview", robots: { index: false, follow: false } }

/**
 * The Portfolio page on an invented portfolio, without the sign-in gate, so a
 * Vercel preview can be looked at without OAuth. Edits and deletes call the
 * real API and are refused (there's no session). Production builds 404 here.
 */
export default function PortfolioPreviewPage() {
  if (process.env.VERCEL_ENV === "production" || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")) notFound()

  return (
    <div className="peerfolio-app min-h-screen">
      <AppNav />
      <main className="peerfolio-main">
        <DemoPortfolio />
      </main>
    </div>
  )
}
