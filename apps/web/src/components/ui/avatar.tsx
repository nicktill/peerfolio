import { cn } from "@web/lib/utils"

const SIZES = { sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm", xl: "h-20 w-20 text-xl" }

function initials(name: string | null, handle: string | null): string {
  const source = name?.trim() || handle?.trim() || "?"
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

export function Avatar({
  src,
  name,
  handle,
  size = "md",
  className,
}: {
  src?: string | null
  name?: string | null
  handle?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  const label = name ?? handle ?? "Member"

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary font-semibold text-secondary-foreground",
        SIZES[size],
        className,
      )}
    >
      {src ? (
        // Avatars come from arbitrary OAuth CDNs; next/image would need each
        // host allow-listed, so a plain img is the pragmatic choice here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span aria-hidden>{initials(name ?? null, handle ?? null)}</span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  )
}
