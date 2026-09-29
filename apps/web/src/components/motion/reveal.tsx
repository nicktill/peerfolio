import { cn } from "@web/lib/utils"

/**
 * Fades and lifts its children in, `index` steps after the start, so a page's
 * sections arrive one after another instead of all at once. Plays once when it
 * mounts (not on data refreshes) and is instant with reduced motion.
 */
export function Reveal({
  index = 0,
  className,
  children,
  ...props
}: { index?: number } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("reveal", className)} style={{ "--i": index } as React.CSSProperties} {...props}>
      {children}
    </div>
  )
}

/** The same stagger for an element you'd rather not wrap. */
export const revealStyle = (index: number) => ({ "--i": index }) as React.CSSProperties
