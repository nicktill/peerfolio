import { revealStyle } from "@web/components/motion/reveal"
import { CastAvatar } from "@web/components/landing/cast-avatar"
import { CAST } from "@web/components/landing/demo"
import { cn } from "@web/lib/utils"

/**
 * A group-chat message resting on a top corner of the league preview, its sender's
 * avatar straddling the card edge. The outer element carries position, tilt and the
 * entrance; the inner one carries the endless float, so the two never fight over a property.
 */
export function ChatBubble({ memberId, side, children, className, delay = 0 }: { memberId: string; side: "left" | "right"; children: React.ReactNode; className?: string; delay?: number }) {
  const member = CAST.find((m) => m.id === memberId)!
  return (
    <div aria-hidden className={cn("reveal absolute z-10 hidden xl:block", className)} style={revealStyle(6 + Math.round(delay / 1.5))}>
      <div className="float-y relative" style={{ animationDelay: `${delay}s` }}>
        <div className="pf-bubble">
          <p>{member.name}</p>
          <p className="mt-0.5 leading-snug" style={{ font: "inherit", textTransform: "none", letterSpacing: 0, color: "var(--fg)" }}>{children}</p>
        </div>
        <span className={cn("absolute -bottom-[18px] rounded-full p-[2px]", side === "left" ? "-left-9" : "-right-9")} style={{ background: "var(--bg)", boxShadow: `0 0 0 1.5px ${member.color}` }}>
          <CastAvatar member={member} size={30} />
        </span>
      </div>
    </div>
  )
}
