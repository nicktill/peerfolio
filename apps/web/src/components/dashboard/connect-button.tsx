"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link"
import { Building2, Clock } from "lucide-react"
import { Button, type ButtonProps } from "@web/components/ui/button"
import { useToast } from "@web/components/ui/toast"
import { connectionNotice } from "@web/lib/plaid-status"
import { exchangePublicToken, pendingLinkToken } from "@web/lib/plaid-link"
import { userLimitNotice } from "@web/lib/plaid-access-core"
import { linkUnavailable, preLinkNotice, type PreLinkNotice } from "@web/lib/plaid-link-copy"
import { RequestMore } from "@web/components/dashboard/request-more-dialog"
import { PreLinkDialog } from "@web/components/dashboard/pre-link-dialog"
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
  capApplies?: boolean
  userLimit?: { used: number; limit: number; remaining: number }
}

const CAPTION = "w-full text-xs leading-snug text-muted-foreground"

/** A tab coming back after at least this long re-reads access; also the retry pace while the check itself is failing. */
const RECHECK_MS = 60_000

/**
 * Brokerage access is read when the button mounts, again when the tab comes back after a while, and once more
 * right before Link opens, rather than on a timer: an open dashboard shouldn't keep the database awake for an
 * answer that rarely changes. Only a failed check keeps retrying, so a blip doesn't leave the button greyed out.
 * None of this is the authorization: the link-token and exchange routes check access again on the server.
 */
function useBrokerageAccess(enabled: boolean) {
  const access = useApi<Access>(enabled ? "/api/plaid/access" : null)
  const { data, error, loading, refetch } = access
  const checkedAt = useRef(0)
  useEffect(() => {
    if (!loading && (data || error)) checkedAt.current = Date.now()
  }, [data, error, loading])
  useEffect(() => {
    if (!enabled) return
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - checkedAt.current >= RECHECK_MS) void refetch()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [enabled, refetch])
  useEffect(() => {
    if (!enabled || !error || loading) return
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") void refetch()
    }, RECHECK_MS)
    return () => window.clearTimeout(timer)
  }, [enabled, error, loading, refetch])
  return access
}

/**
 * The last word before Link opens. True when access still holds, or when the check itself couldn't be made
 * (the server refuses the link token or exchange if access is really gone). False after switching the button
 * to its unavailable state.
 */
async function confirmAccess(refetch: () => Promise<void>): Promise<boolean> {
  try {
    const fresh = await mutate<Access>("/api/plaid/access", { method: "GET" })
    if (fresh.allowed) return true
  } catch {
    return true
  }
  await refetch()
  return false
}

export function ConnectButton(props: Props) {
  const { data, error, refetch } = useBrokerageAccess(!props.itemId)
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
        {data?.code === "user_limit" || data?.code === "full" ? <RequestMore limit={data.userLimit?.limit ?? 0} full={data.code === "full"} /> : null}
      </>
    )
  }
  if (!props.itemId) {
    return (
      <>
        <PlaidConnectButton
          {...props}
          preLink={preLinkNotice({ capApplies: data?.capApplies === true, used: data?.userLimit?.used ?? 0, limit: data?.userLimit?.limit ?? 0 })}
          confirm={() => confirmAccess(refetch)}
          onConnected={() => { props.onConnected(); refetch() }}
        />
        {data?.capApplies && data.userLimit ? <p className={CAPTION}>{userLimitNotice(data.userLimit.limit)}</p> : null}
      </>
    )
  }
  return <PlaidConnectButton {...props} />
}

function PlaidConnectButton({ onConnected, itemId, children, preLink = null, confirm, ...buttonProps }: Props & { preLink?: PreLinkNotice | null; confirm?: () => Promise<boolean> }) {
  const [confirming, setConfirming] = useState(false)
  const [checking, setChecking] = useState(false)
  const { toast } = useToast()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [exchanging, setExchanging] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [expiration, setExpiration] = useState<number>(0)
  // Which Trial team issued the Link session; the exchange must be reserved against the same one.
  const [pool, setPool] = useState<number | undefined>(undefined)
  const exchangeInFlight = useRef(false)

  useEffect(() => {
    let cancelled = false
    setUnavailable(false)
    setLinkToken(null)

    mutate<{ linkToken: string; expiration: string; pool?: number }>("/api/plaid/link-token", { body: itemId ? { itemId } : {} })
      .then((data) => {
        if (!cancelled) {
          setLinkToken(data.linkToken)
          setExpiration(Date.parse(data.expiration))
          setPool(data.pool)
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
        const result = await exchangePublicToken(publicToken, metadata, itemId, pool)
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
    [onConnected, toast, itemId, pool],
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

  function start() {
    if (!Number.isFinite(expiration) || expiration <= Date.now()) {
      setAttempt((value) => value + 1)
      toast("Connection session expired. Please try again.", "info")
      return
    }
    // Kept for /oauth-return in case an OAuth bank takes the user away.
    pendingLinkToken.save(linkToken!, itemId, expiration, pool)
    open()
  }

  async function begin() {
    if (confirm) {
      setChecking(true)
      const ok = await confirm().finally(() => setChecking(false))
      if (!ok) return
    }
    // New connections get the heads-up every time; repairs go straight to Link.
    if (preLink && !itemId) setConfirming(true)
    else start()
  }

  return (
    <>
      <Button
        {...buttonProps}
        onClick={() => void begin()}
        disabled={!ready || !linkToken || exchanging || checking} loading={exchanging || checking}>
        {!exchanging && !checking ? <Building2 aria-hidden /> : null}
        {children ?? (itemId ? "Reconnect" : "Connect account")}
      </Button>
      <PreLinkDialog
        notice={confirming && !itemId ? preLink : null}
        onCancel={() => setConfirming(false)}
        onContinue={() => { setConfirming(false); start() }}
      />
    </>
  )
}
