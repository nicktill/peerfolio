"use client"

import { useState } from "react"
import type { Member } from "@web/components/landing/demo"

/** Fictional casual profile pictures. Sam uses the golden retriever; the unused sixth tile is never shown. */
export function CastAvatar({ member, size = 32, className }: { member: Pick<Member, "name" | "color" | "look">; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const tile = member.look
  const initials = member.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")
  return (
    <span role="img" aria-label={member.name} className={className} style={{ display: "inline-grid", placeItems: "center", position: "relative", width: size, height: size, flex: "none", borderRadius: "50%", overflow: "hidden", background: "var(--raise)", color: "var(--fg2)", fontSize: size * .32, lineHeight: 1 }}>
      <span aria-hidden>{initials}</span>
      {!failed ? (
        // One small shared atlas, with CSS selecting a square tile; no remote profile requests.
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/landing/avatars/casual-profiles.webp" alt="" width={768} height={512} onError={() => setFailed(true)} draggable={false}
          style={{ position: "absolute", width: "300%", height: "200%", maxWidth: "none", left: `${-(tile % 3) * 100}%`, top: `${-Math.floor(tile / 3) * 100}%` }} />
      ) : null}
    </span>
  )
}
