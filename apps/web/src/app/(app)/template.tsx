"use client"

import { useEffect, useState } from "react"
import { cn } from "@web/lib/utils"

/**
 * A template (unlike a layout) remounts on every navigation, so each page eases
 * in as you move between them. `pf-entering` only lasts for the first moments, so
 * panels that mount later (data arriving) don't replay the stagger.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const [entering, setEntering] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 900)
    return () => clearTimeout(t)
  }, [])
  return <div className={cn("page-in", entering && "pf-entering")}>{children}</div>
}
