"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@web/lib/utils"

const SIZES = { xs: "size-[18px] text-[6px]", sm: "size-8 text-[10px]", md: "size-10 text-[11px]", lg: "size-12 text-xs" }

/** Stable hue per ticker so a monogram looks the same everywhere. */
function hue(symbol: string) {
  let h = 0
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

/**
 * Company icon from the logo proxy, falling back to a coloured monogram when
 * there's no logo (crypto, funds, tiny caps) or it fails to load.
 */
/** Symbols whose logo already failed this session, so later mounts skip the request. */
const missing = new Set<string>()

export function TickerLogo({ symbol, kind = "stock", size = "md", className }: { symbol: string; kind?: "stock" | "crypto"; size?: keyof typeof SIZES; className?: string }) {
  const [failed, setFailed] = useState(() => missing.has(symbol.toUpperCase()))
  const image = useRef<HTMLImageElement>(null)
  // An image that failed before this component hydrated never fires onError here, so look once it has mounted.
  useEffect(() => {
    const el = image.current
    if (el?.complete && el.naturalWidth === 0) {
      missing.add(symbol.toUpperCase())
      setFailed(true)
    }
  }, [symbol])
  const s = symbol.toUpperCase()
  const showImage = kind === "stock" && !failed

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-xl font-mono font-bold",
        showImage ? "border-0 shadow-none" : "border border-[hsl(var(--tl-h)_40%_50%/0.3)] bg-[hsl(var(--tl-h)_60%_93%)] dark:bg-[hsl(var(--tl-h)_30%_22%)] text-[hsl(var(--tl-h)_60%_30%)] shadow-none dark:text-[hsl(var(--tl-h)_70%_78%)]",
        SIZES[size],
        className,
      )}
      style={showImage ? undefined : ({ "--tl-h": hue(s) } as React.CSSProperties)}
      aria-hidden
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- proxied, already cached at the edge
        <img ref={image} src={`/api/market/logo/${encodeURIComponent(s)}`} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" onError={() => {
          missing.add(s)
          setFailed(true)
        }} />
      ) : (
        s.slice(0, size === "xs" ? 2 : 4)
      )}
    </span>
  )
}
