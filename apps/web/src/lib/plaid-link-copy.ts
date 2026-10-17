import { USER_PRODUCTION_LINK_LIMIT, userLimitNotice } from "./plaid-access-core.ts"

export type LinkUnavailableCode = "paused" | "off" | "unconfigured" | "user_limit" | "full"

export type LinkUnavailable = {
  /** Short pill text; the longer explanation never goes inside the button. */
  label: string
  title: string
  /** Muted line under the pill. `link` is rendered as the contact link between `lead` and `tail`. */
  caption?: { lead: string; link?: string; tail?: string }
  /** Tooltip text on the pill (desktop); the caption carries the same message for phones and screen readers. */
  tip?: string
}

/**
 * What the disabled Add button says for each access code. The real pool numbers and reason are only ever sent to admins.
 */
export function linkUnavailable(code: LinkUnavailableCode, userLimit?: { used: number; limit: number }): LinkUnavailable {
  switch (code) {
    case "paused":
      return { label: "Brokerage linking paused", title: "Brokerage linking is paused for now." }
    case "full":
      return {
        label: "Linking full",
        title: "Brokerage linking is full right now.",
        caption: { lead: "Brokerage linking is full right now. ", link: "Reach out", tail: " to connect." },
      }
    case "user_limit": {
      const limit = userLimit?.limit ?? USER_PRODUCTION_LINK_LIMIT
      const notice = userLimitNotice(limit)
      return {
        label: limit <= 0 ? "Linking unavailable" : `${Math.min(userLimit?.used ?? limit, limit)} of ${limit} connected`,
        title: notice,
        tip: notice,
        caption: { lead: notice },
      }
    }
    case "off":
      return { label: "Brokerage linking unavailable", title: "Brokerage linking is turned off for your account." }
    case "unconfigured":
      return { label: "Brokerage linking soon", title: "Brokerage linking is coming soon." }
  }
}

export const PRE_LINK_TITLE = "Before you connect"
export const PRE_LINK_CONTINUE = "Continue"

export type PreLinkNotice = { title: string; body: string; remaining: string; continueLabel: string }

/**
 * The calm heads-up shown every time before Plaid Link opens for a new connection. Only where the cap applies
 * (production) and a slot is left; in sandbox, for repairs, or at the cap there is nothing to confirm.
 */
export function preLinkNotice(input: { capApplies: boolean; used: number; limit: number }): PreLinkNotice | null {
  if (!input.capApplies) return null
  const left = Math.max(0, input.limit - input.used)
  if (left === 0) return null
  return {
    title: PRE_LINK_TITLE,
    body: `You can connect up to ${input.limit} ${input.limit === 1 ? "brokerage" : "brokerages"}. Only connect an account you plan to keep \u2014 disconnecting ${input.limit === 1 ? "it still counts" : "one still counts"} toward your ${input.limit}.`,
    remaining: left === input.limit ? `You have ${left} left.` : `You have ${left} left of ${input.limit}.`,
    continueLabel: PRE_LINK_CONTINUE,
  }
}
