import { cn } from "@web/lib/utils"

/** A group-chat message floating beside the league preview. */
export function ChatBubble({ from, children, className, delay = 0 }: { from: string; children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <div
      aria-hidden
      className={cn("float-y absolute z-10 hidden max-w-[15rem] rounded-2xl border bg-card px-3.5 py-2.5 text-sm shadow-lg lg:block", className)}
      style={{ animationDelay: `${delay}s` }}
    >
      <p className="text-[11px] font-semibold text-muted-foreground">{from}</p>
      <p className="mt-0.5 leading-snug">{children}</p>
    </div>
  )
}
