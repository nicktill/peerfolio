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
  save(token: string) {
    try {
      localStorage.setItem(KEY, token)
    } catch {
      // Storage blocked: OAuth banks won't resume, everything else still works.
    }
  },
  load(): string | null {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY)
    } catch {}
  },
}

/** Hands Link's public token to the server, which stores the access token encrypted. */
export function exchangePublicToken(publicToken: string, metadata: PlaidLinkOnSuccessMetadata) {
  return mutate("/api/plaid/exchange", {
    body: {
      publicToken,
      institution: metadata.institution
        ? { name: metadata.institution.name, institution_id: metadata.institution.institution_id }
        : undefined,
    },
  })
}
