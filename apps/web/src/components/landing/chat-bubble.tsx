import { revealStyle } from "@web/components/motion/reveal"
import { cn } from "@web/lib/utils"

/**
 * A group-chat message floating beside the league preview. The outer element
 * carries position, tilt and the entrance; the inner one carries the endless
 * float, so the two animations never fight over the same property.
 */
export function ChatBubble({ from, children, className, delay = 0 }: { from: string; children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <div aria-hidden className={cn("reveal absolute z-10 hidden xl:block", className)} style={revealStyle(6 + Math.round(delay / 1.5))}>
      <div className="float-y pf-bubble" style={{ animationDelay: `${delay}s` }}>
        <p>{from}</p>
        <p className="mt-0.5 leading-snug" style={{ font: "inherit", textTransform: "none", letterSpacing: 0, color: "var(--fg)" }}>{children}</p>
      </div>
    </div>
  )
}
