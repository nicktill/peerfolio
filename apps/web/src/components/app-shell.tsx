"use client"

import { createContext, useContext, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { AppNav } from "@web/components/app-nav"
import { RouteProgress } from "@web/components/ui/route-progress"
import { AssistantProvider } from "@web/components/assistant/use-assistant"
import { AssistantRoot } from "@web/components/assistant/assistant"

/**
 * On by default. The assistant only appears once the server confirms it is usable (API key, budget, its
 * table: see /api/assistant/status), and `ASSISTANT_ENABLED=0` on the server hides it without a redeploy.
 * `NEXT_PUBLIC_ASSISTANT_ENABLED=0` removes it from the build entirely.
 */
const ASSISTANT_ENABLED = process.env.NEXT_PUBLIC_ASSISTANT_ENABLED !== "0"

const PreviewDemoContext = createContext(false)
export const usePreviewDemo = () => useContext(PreviewDemoContext)

/**
 * The signed-in frame: nav and the page.
 *
 * It renders while the session is still being confirmed, rather than showing a
 * placeholder and swapping the whole frame in afterwards. Data routes check the
 * session themselves, so nothing private is exposed in the moment before a
 * signed-out visitor is redirected.
 */
export function AppShell({ children, previewDemo = false }: { children: React.ReactNode; previewDemo?: boolean }) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  if (status === "unauthenticated") return null

  return (
    <PreviewDemoContext.Provider value={previewDemo && !!session?.user?.email?.endsWith("@example.com")}>
    <div className="peerfolio-app min-h-screen">
      <RouteProgress />
      <AppNav />
      {/* Wide enough for a dashboard on a laptop; text-heavy pages set their own reading width. Bottom padding clears the mobile tab bar. */}
      {previewDemo && session?.user?.email?.endsWith("@example.com") ? <div className="pf-demo-pill" role="status">Demo data</div> : null}
      <main className="peerfolio-main">{children}</main>
      {ASSISTANT_ENABLED && status === "authenticated" ? (
        <AssistantProvider>
          <AssistantRoot />
        </AssistantProvider>
      ) : null}
    </div>
    </PreviewDemoContext.Provider>
  )
}
