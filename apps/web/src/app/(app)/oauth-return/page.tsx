"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { usePlaidLink } from "react-plaid-link"
import { Building2 } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Card, CardContent } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"
import { useToast } from "@web/components/ui/toast"
import { connectionNotice } from "@web/lib/plaid-status"
import { exchangePublicToken, pendingLinkToken } from "@web/lib/plaid-link"

/**
 * Where OAuth institutions send people back to (PLAID_REDIRECT_URI).
 *
 * Re-opens Link with the token saved before the user left, plus the URL the
 * bank returned them to, so Link can finish the connection where it stopped.
 */
export default function OAuthReturnPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [token, setToken] = useState<string | null>(null)
  const [redirectUri, setRedirectUri] = useState<string>()
  const [missing, setMissing] = useState(false)
  const opened = useRef(false)
  const completing = useRef(false)

  // Both only exist in the browser, so read them after mount.
  useEffect(() => {
    const saved = pendingLinkToken.load()
    if (saved) {
      setToken(saved)
      setRedirectUri(window.location.href)
    } else {
      setMissing(true)
    }
  }, [])

  const { open, ready } = usePlaidLink({
    token,
    receivedRedirectUri: redirectUri,
    onSuccess: async (publicToken, metadata) => {
      if (completing.current) return
      completing.current = true
      const itemId = pendingLinkToken.itemId()
      pendingLinkToken.clear()
      try {
        const result = await exchangePublicToken(publicToken, metadata, itemId)
        const notice = connectionNotice("item" in result ? result.item : result.result)
        toast(notice.message, notice.tone)
      } catch (error) {
        toast(error instanceof Error ? error.message : "Couldn't connect that account.", "error")
      }
      router.replace("/dashboard")
    },
    onExit: () => {
      pendingLinkToken.clear()
      router.replace("/dashboard")
    },
  })

  useEffect(() => {
    if (ready && !opened.current) {
      opened.current = true
      open()
    }
  }, [ready, open])

  return (
    <Card>
      <CardContent className="pt-5">
        {missing ? (
          <EmptyState
            icon={Building2}
            title="This connection expired"
            description="We couldn't pick up where your bank left off. Start the connection again from your portfolio."
            action={
              <Button asChild>
                <Link href="/dashboard">Back to portfolio</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Building2}
            title="Finishing your connection…"
            description="Your bank sent you back. Plaid will open in a moment to complete the link."
          />
        )}
      </CardContent>
    </Card>
  )
}
