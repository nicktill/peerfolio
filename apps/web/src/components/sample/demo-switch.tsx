"use client"

import "@web/components/sample/sample.css"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { getDemoMode, setDemoMode, type DemoMode } from "@web/lib/sample/demo-mode"

const MODES: { value: DemoMode; label: string }[] = [
  { value: "real", label: "Real" },
  { value: "empty", label: "Empty" },
  { value: "sample", label: "Sample" },
]

/** Where Sample mode sends the screens that have a dedicated sample view. */
const SAMPLE_TWINS = ["/dashboard", "/board"]

/**
 * Local-only switch, shown in dev login mode: Real data, Empty (see the empty states) or Sample (see the
 * sample data). Stored in this browser; `?demo=empty|sample|real` does the same from a link.
 */
export function DemoSwitch() {
  const [mode, setMode] = useState<DemoMode>("real")
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => setMode(getDemoMode()), [])
  useEffect(() => {
    if (mode === "sample" && SAMPLE_TWINS.includes(pathname)) router.replace(`${pathname}/sample`)
  }, [mode, pathname, router])

  return (
    <div className="ds" role="group" aria-label="Demo data">
      <span>Demo</span>
      {MODES.map((m) => (
        <button key={m.value} type="button" aria-pressed={mode === m.value} onClick={() => (m.value === mode ? undefined : setDemoMode(m.value))}>
          {m.label}
        </button>
      ))}
    </div>
  )
}
