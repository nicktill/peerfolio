"use client"

import { useCallback, useEffect, useState } from "react"
import { usePlaidLink } from "react-plaid-link"
import { Building2 } from "lucide-react"
import { Button, type ButtonProps } from "@web/components/ui/button"
import { useToast } from "@web/components/ui/toast"
import { mutate } from "@web/lib/use-api"

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
export function ConnectButton({ onConnected, itemId, children, ...buttonProps }: Props) {
  const { toast } = useToast()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [exchanging, setExchanging] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false

    mutate<{ linkToken: string }>("/api/plaid/link-token", { body: itemId ? { itemId } : {} })
      .then((data) => {
        if (!cancelled) setLinkToken(data.linkToken)
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true)
      })

    return () => {
      cancelled = true
    }
  }, [itemId])

  const onSuccess = useCallback(
    async (publicToken: string, metadata: { institution?: { name?: string; institution_id?: string } }) => {
      setExchanging(true)
      try {
        await mutate("/api/plaid/exchange", {
          body: { publicToken, institution: metadata.institution },
        })
        toast("Account connected.", "success")
        onConnected()
      } catch (error) {
        toast(error instanceof Error ? error.message : "Couldn't connect that account.", "error")
      } finally {
        setExchanging(false)
      }
    },
    [onConnected, toast],
  )

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken, metadata) => void onSuccess(publicToken, metadata as never),
  })

  if (unavailable) {
    return (
      <Button {...buttonProps} disabled>
        <Building2 aria-hidden />
        Connecting unavailable
      </Button>
    )
  }

  return (
    <Button {...buttonProps} onClick={() => open()} disabled={!ready || !linkToken} loading={exchanging}>
      {!exchanging ? <Building2 aria-hidden /> : null}
      {children ?? (itemId ? "Reconnect" : "Connect account")}
    </Button>
  )
}
