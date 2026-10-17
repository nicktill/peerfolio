import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AssistantProvider } from "@web/components/assistant/use-assistant"
import { AssistantRoot } from "@web/components/assistant/assistant"
import { CannedAssistant } from "./canned"
import { Gallery } from "./gallery"

export const metadata: Metadata = { title: "Assistant harness", robots: { index: false, follow: false } }

/**
 * The assistant on an empty page, without sign-in. The browser answers its API calls with canned text (see
 * ./canned.tsx), so it works with no OpenAI key; `?live=1` skips that and uses the real route (which is what
 * `scripts/assistant-visual-check.mjs` does, mocking the API itself). Production builds 404 here.
 */
export default function AssistantHarness() {
  if (process.env.VERCEL_ENV === "production" || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")) notFound()

  return (
    <div className="peerfolio-app min-h-screen">
      <AssistantProvider>
        <main className="peerfolio-main">
          <h1 className="p-6 text-lg">Assistant harness</h1>
          <p className="px-6 text-sm opacity-70">Open the assistant (bottom right) or press a button to see each figure type. Answers are canned; nothing calls a model.</p>
          <Gallery />
        </main>
        <CannedAssistant />
        <AssistantRoot />
      </AssistantProvider>
    </div>
  )
}
