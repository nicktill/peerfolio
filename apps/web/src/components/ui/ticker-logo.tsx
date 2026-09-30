"use client"

import { useState } from "react"
import { cn } from "@web/lib/utils"

const SIZES = { sm: "size-8 text-[10px]", md: "size-10 text-[11px]", lg: "size-12 text-xs" }

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
export function TickerLogo({ symbol, kind = "stock", size = "md", className }: { symbol: string; kind?: "stock" | "crypto"; size?: keyof typeof SIZES; className?: string }) {
  const [failed, setFailed] = useState(false)
  const s = symbol.toUpperCase()
  const showImage = kind === "stock" && !failed

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-xl border font-mono font-bold shadow-[0_1px_2px_hsl(0_0%_0%/0.18),inset_0_1px_0_hsl(0_0%_100%/0.55)]",
        showImage ? "border-white/15 bg-gradient-to-br from-white via-zinc-50 to-zinc-200" : "border-border/70",
        SIZES[size],
        className,
      )}
      style={showImage ? undefined : { background: `linear-gradient(145deg, hsl(${hue(s)} 65% 96%), hsl(${hue(s)} 55% 89%))`, color: `hsl(${hue(s)} 55% 28%)` }}
      aria-hidden
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- proxied, already cached at the edge
        <img src={`/api/market/logo/${encodeURIComponent(s)}`} alt="" className="size-full object-contain p-1.5 drop-shadow-[0_1px_1px_rgb(0_0_0/0.08)]" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        s.slice(0, 4)
      )}
    </span>
  )
}
