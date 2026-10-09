"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link"
import { Building2, Clock } from "lucide-react"
import { Button, type ButtonProps } from "@web/components/ui/button"
import { useToast } from "@web/components/ui/toast"
import { connectionNotice } from "@web/lib/plaid-status"
import { exchangePublicToken, pendingLinkToken } from "@web/lib/plaid-link"
import { mutate, useApi } from "@web/lib/use-api"

type Props = {
  onConnected: () => void
  /** Set to repair an item flagged `needs_reauth` via Link update mode. */
  itemId?: string
  children?: React.ReactNode
} & Pick<ButtonProps, "variant" | "size" | "className">

/**
 * Opens Plaid Link and hands the public token to the server.
 *
 * The access token never comes back here — the server stores it encrypted and
 * returns only our own item id.
 */
/** Set at build time from PLAID_ENV; see next.config.ts. */
const LINKING_ENABLED = process.env.NEXT_PUBLIC_PLAID_LINKING === "1"

export function ConnectButton(props: Props) {
  const { data, error } = useApi<{ allowed: boolean }>(props.itemId ? null : "/api/plaid/access", [], { refreshMs: 60_000 })
  // Everyone sees the button. It's live for approved accounts and greyed out as "coming soon" for the rest.
  if (!props.itemId && (!LINKING_ENABLED || error || !data?.allowed)) {
    return (
      <Button type="button" size={props.size} className={props.className} variant="outline" disabled title="Brokerage linking is coming soon">
        <Clock aria-hidden />
        Brokerage linking soon
      </Button>
    )
  }
  return <PlaidConnectButton {...props} />
}

function PlaidConnectButton({ onConnected, itemId, children, ...buttonProps }: Props) {
  const { toast } = useToast()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [exchanging, setExchanging] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [expiration, setExpiration] = useState<number>(0)
  const exchangeInFlight = useRef(false)

  useEffect(() => {
    let cancelled = false
    setUnavailable(false)
    setLinkToken(null)

    mutate<{ linkToken: string; expiration: string }>("/api/plaid/link-token", { body: itemId ? { itemId } : {} })
      .then((data) => {
        if (!cancelled) {
          setLinkToken(data.linkToken)
          setExpiration(Date.parse(data.expiration))
        }
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true)
      })

    return () => {
      cancelled = true
    }
  }, [itemId, attempt])

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      if (exchangeInFlight.current) return
      exchangeInFlight.current = true
      pendingLinkToken.clear()
      setExchanging(true)
      try {
        const result = await exchangePublicToken(publicToken, metadata, itemId)
        const notice = connectionNotice("item" in result ? result.item : result.result)
        toast(notice.message, notice.tone)
        onConnected()
      } catch (error) {
        toast(error instanceof Error ? error.message : "Couldn't connect that account.", "error")
      } finally {
        setExchanging(false)
        exchangeInFlight.current = false
        setAttempt((value) => value + 1)
      }
    },
    [onConnected, toast, itemId],
  )

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken, metadata) => void onSuccess(publicToken, metadata),
    onExit: (error) => {
      pendingLinkToken.clear()
      if (error) {
        toast(error.display_message ?? "Connection interrupted. Please try again.", "error")
        setAttempt((value) => value + 1)
      }
    },
  })

  if (unavailable) {
    return (
      <Button {...buttonProps} onClick={() => setAttempt((value) => value + 1)}>
        <Building2 aria-hidden />
        Retry connection
      </Button>
    )
  }

  return (
    <Button
      {...buttonProps}
      onClick={() => {
        if (!Number.isFinite(expiration) || expiration <= Date.now()) {
          setAttempt((value) => value + 1)
          toast("Connection session expired. Please try again.", "info")
          return
        }
        // Kept for /oauth-return in case an OAuth bank takes the user away.
        pendingLinkToken.save(linkToken!, itemId, expiration)
        open()
      }}
      disabled={!ready || !linkToken || exchanging} loading={exchanging}>
      {!exchanging ? <Building2 aria-hidden /> : null}
      {children ?? (itemId ? "Reconnect" : "Connect account")}
    </Button>
  )
}
