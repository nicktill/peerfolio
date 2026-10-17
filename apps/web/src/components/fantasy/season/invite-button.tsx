"use client"

import { useState } from "react"
import { Check, Link2 } from "lucide-react"

/** Copies the league's invite link. The same control as the league page's, for the season page of a draft league. */
export function InviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="fw-btn"
      data-solid
      onClick={() => {
        void navigator.clipboard.writeText(`${window.location.origin}/fantasy/join/${code}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      {copied ? "Link copied" : "Invite friends"}
    </button>
  )
}
