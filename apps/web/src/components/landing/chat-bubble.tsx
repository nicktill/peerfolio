import { revealStyle } from "@web/components/motion/reveal"
import { cn } from "@web/lib/utils"

/**
 * A group-chat message floating beside the league preview. The outer element
 * carries position, tilt and the entrance; the inner one carries the endless
 * float, so the two animations never fight over the same property.
 */
export function ChatBubble({ from, children, className, delay = 0 }: { from: string; children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <div aria-hidden className={cn("reveal absolute z-10 hidden lg:block", className)} style={revealStyle(6 + Math.round(delay / 1.5))}>
      <div className="float-y max-w-[15rem] rounded-2xl border bg-card px-3.5 py-2.5 text-sm shadow-lg" style={{ animationDelay: `${delay}s` }}>
        <p className="text-[11px] font-semibold text-muted-foreground">{from}</p>
        <p className="mt-0.5 leading-snug">{children}</p>
      </div>
    </div>
  )
}
