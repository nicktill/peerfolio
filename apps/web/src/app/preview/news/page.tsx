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
    <div className="app-bg min-h-screen">
      <AppNav />
      <main className="mx-auto max-w-[1360px] px-4 pb-24 pt-6 sm:px-6 sm:pb-12">
        <NewsBoard holdingMoves="sample" />
      </main>
    </div>
  )
}
