"use client"

import type { PlaidLinkOnSuccessMetadata } from "react-plaid-link"
import { mutate } from "@web/lib/use-api"

/**
 * OAuth institutions (Chase, Schwab, Fidelity…) send the user to their own
 * site and back to /oauth-return, where Link must re-open with the *same* link
 * token. It waits here in between. localStorage rather than sessionStorage,
 * because some banks bring people back in a new tab.
 */
const KEY = "peerfolio:plaid-link-token"

export const pendingLinkToken = {
  save(token: string, itemId?: string, expiration?: number) {
    try {
      localStorage.setItem(KEY, token)
      localStorage.setItem(`${KEY}:expiration`, String(expiration ?? Date.now() + 30 * 60 * 1000))
      if (itemId) localStorage.setItem(`${KEY}:item`, itemId)
      else localStorage.removeItem(`${KEY}:item`)
    } catch {
      // Storage blocked: OAuth banks won't resume, everything else still works.
    }
  },
  load(): string | null {
    try {
      const expiration = Number(localStorage.getItem(`${KEY}:expiration`))
      if (!Number.isFinite(expiration) || expiration <= Date.now()) {
        pendingLinkToken.clear()
        return null
      }
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  },
  itemId(): string | undefined {
    try { return localStorage.getItem(`${KEY}:item`) ?? undefined } catch { return undefined }
  },
  clear() {
    try {
      localStorage.removeItem(KEY)
      localStorage.removeItem(`${KEY}:expiration`)
      localStorage.removeItem(`${KEY}:item`)
    } catch {}
  },
}

/** Hands Link's public token to the server, which stores the access token encrypted. */
export function exchangePublicToken(publicToken: string, metadata: PlaidLinkOnSuccessMetadata, itemId?: string) {
  if (itemId) return mutate<{ result: { status: string; errorCode?: string | null } }>(`/api/plaid/items/${encodeURIComponent(itemId)}`, { body: {} })
  return mutate<{ item: { status: string; errorCode?: string | null } }>("/api/plaid/exchange", {
    body: {
      publicToken,
      institution: metadata.institution
        ? { name: metadata.institution.name, institution_id: metadata.institution.institution_id }
        : undefined,
    },
  })
}
