import { USER_LINK_LIMIT_NOTICE, USER_PRODUCTION_LINK_LIMIT } from "./plaid-access-core.ts"

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
      return {
        label: `${Math.min(userLimit?.used ?? limit, limit)} of ${limit} connected`,
        title: USER_LINK_LIMIT_NOTICE,
        tip: USER_LINK_LIMIT_NOTICE,
        caption: { lead: USER_LINK_LIMIT_NOTICE },
      }
    }
    case "off":
      return { label: "Brokerage linking unavailable", title: "Brokerage linking is turned off for your account." }
    case "unconfigured":
      return { label: "Brokerage linking soon", title: "Brokerage linking is coming soon." }
  }
}
