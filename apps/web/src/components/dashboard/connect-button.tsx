"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link"
import { Building2, Clock } from "lucide-react"
import { Button, type ButtonProps } from "@web/components/ui/button"
import { useToast } from "@web/components/ui/toast"
import { connectionNotice } from "@web/lib/plaid-status"
import { exchangePublicToken, pendingLinkToken } from "@web/lib/plaid-link"
import { USER_LINK_LIMIT_NOTICE } from "@web/lib/plaid-access-core"
import { linkUnavailable } from "@web/lib/plaid-link-copy"
import { CONTACT_EMAIL } from "@web/components/site-footer"
import { Tip } from "@web/components/ui/tip"
import { cn } from "@web/lib/utils"
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
type Access = {
  allowed: boolean
  code?: "paused" | "off" | "unconfigured" | "user_limit" | "full"
  reason?: string
  userLimit?: { used: number; limit: number; remaining: number }
}

const CAPTION = "w-full text-xs leading-snug text-muted-foreground"

export function ConnectButton(props: Props) {
  const { data, error } = useApi<Access>(props.itemId ? null : "/api/plaid/access", [], { refreshMs: 60_000 })
  // Everyone sees the button. The server decides, live, whether it's usable for this account:
  // it's live for everyone not blocked, and greyed out (with a short pill and a muted note) otherwise.
  if (!props.itemId && (error || !data?.allowed)) {
    const shown = error
      ? { label: "Brokerage linking unavailable", title: "Couldn't check brokerage access. Try again shortly.", caption: undefined, tip: undefined }
      : linkUnavailable(data?.code ?? "off", data?.userLimit)
    const noteId = "link-unavailable-note"
    const pill = (
      <Button
        type="button"
        size={props.size}
        className={cn("max-w-full", props.className)}
        variant="outline"
        disabled
        title={data?.reason && !shown.tip ? `${shown.title} (${data.reason})` : shown.title}
        aria-describedby={shown.caption ? noteId : undefined}
      >
        <Clock aria-hidden />
        <span className="truncate">{shown.label}</span>
      </Button>
    )
    return (
      <>
        {/* A disabled button swallows hover and focus, so the tooltip wraps it; the caption below is the phone and screen-reader copy. */}
        {shown.tip ? <Tip text={shown.tip}>{pill}</Tip> : pill}
        {shown.caption ? (
          <p id={noteId} className={cn(CAPTION, shown.tip && "sm:sr-only")}>
            {shown.caption.lead}
            {shown.caption.link ? (
              <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Brokerage linking")}`} className="underline underline-offset-2 hover:text-foreground">
                {shown.caption.link}
              </a>
            ) : null}
            {shown.caption.tail}
          </p>
        ) : null}
      </>
    )
  }
  if (!props.itemId) {
    return (
      <>
        <PlaidConnectButton {...props} />
        <p className={CAPTION}>{USER_LINK_LIMIT_NOTICE}</p>
      </>
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
