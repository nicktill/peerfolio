import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AppNav } from "@web/components/app-nav"
import { NewsBoard } from "@web/components/news/news-board"

export const metadata: Metadata = { title: "News preview", robots: { index: false, follow: false } }

/**
 * The News page without the sign-in gate, so a Vercel preview can be looked at
 * without OAuth (Google only accepts the production redirect URL). The page is
 * sample data only. Production builds 404 here.
 */
export default function NewsPreviewPage() {
  if (process.env.VERCEL_ENV === "production" || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")) notFound()

  return (
    <div className="peerfolio-app min-h-screen">
      <AppNav />
      <main className="peerfolio-main">
        <NewsBoard holdingMoves="sample" />
      </main>
    </div>
  )
}
