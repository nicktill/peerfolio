import Image from "next/image"
import { cn } from "@web/lib/utils"

const SIZES = { sm: "h-7 w-7 text-[10px]", md: "h-8 w-8 text-[11px]", lg: "h-12 w-12 text-sm", xl: "h-20 w-20 text-xl" }

export function initialsFor(name: string | null | undefined, handle: string | null | undefined): string {
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
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-input bg-secondary font-sans font-medium tracking-[0.02em] text-muted-foreground",
        SIZES[size],
        className,
      )}
    >
      {src?.startsWith("/demo/avatars/") && src.endsWith(".png") ? (
        <Image src={src} alt="" width={80} height={80} sizes={size === "xl" ? "80px" : size === "lg" ? "48px" : "32px"} className="h-full w-full object-cover" />
      ) : src ? (
        // Avatars come from arbitrary OAuth CDNs; next/image would need each
        // host allow-listed, so a plain img is the pragmatic choice here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span aria-hidden>{initialsFor(name, handle)}</span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  )
}
