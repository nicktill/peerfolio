import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AssistantProvider } from "@web/components/assistant/use-assistant"
import { AssistantRoot } from "@web/components/assistant/assistant"

export const metadata: Metadata = { title: "Assistant harness", robots: { index: false, follow: false } }

/**
 * The assistant on an empty page, without sign-in, for `scripts/assistant-visual-check.cjs` (which mocks the
 * API). Production builds 404 here.
 */
export default function AssistantHarness() {
  if (process.env.VERCEL_ENV === "production" || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")) notFound()

  return (
    <div className="peerfolio-app min-h-screen">
      <main className="peerfolio-main">
        <h1 className="p-6 text-lg">Assistant harness</h1>
      </main>
      <AssistantProvider>
        <AssistantRoot />
      </AssistantProvider>
    </div>
  )
}
