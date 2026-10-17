"use client"

import "@web/components/sample/sample.css"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowRight, Play, RotateCcw, X } from "lucide-react"
import { inSampleView } from "@web/lib/sample/fixtures"
import { clearSample, resetSample, simulateGames } from "@web/lib/sample/store"
import { InfoTip } from "@web/components/ui/tip"

const KINDS: { match: string; cta: string; to: string; exit: string }[] = [
  { match: "/dashboard", cta: "Link your accounts", to: "/dashboard", exit: "/dashboard" },
  { match: "/board", cta: "Start a league", to: "/leagues?create=1", exit: "/board" },
  { match: "/leagues", cta: "Start a league", to: "/leagues?create=1", exit: "/leagues" },
  { match: "/fantasy", cta: "Start a league", to: "/fantasy", exit: "/fantasy" },
]

/**
 * Sits above every sample view and stays in view as you scroll: it says the numbers are made up, offers the
 * real next step, and leaves in one click. Renders nothing outside a `/sample` path.
 */
export function SampleBanner() {
  const pathname = usePathname()
  if (!inSampleView(pathname)) return null
  const tradable = /^\/fantasy\/(sports\/)?sample/.test(pathname)
  const sports = pathname.startsWith("/fantasy/sports/sample")
  const kind = KINDS.find((k) => pathname.startsWith(k.match)) ?? KINDS[0]!
  return (
    <div className="sb" role="status">
      <span className="sb-pill">
        <i aria-hidden /> Sample data
      </span>
      <p className="sb-text">
        {tradable ? "Made-up league. Try a trade or a pick: it stays in this tab." : "Made-up people and numbers, so you can see how it looks."}
        <InfoTip text="Nothing here is yours. Your accounts, leagues and picks are not read or changed while you look around." label="About sample data" />
      </p>
      {sports ? (
        <button type="button" className="sb-exit" onClick={() => simulateGames()} title="Plays your open picks out: a win, then a loss">
          <Play aria-hidden /> <span>Simulate the games</span>
        </button>
      ) : null}
      {tradable ? (
        <button type="button" className="sb-exit" onClick={() => resetSample()} aria-label="Reset sample">
          <RotateCcw aria-hidden /> <span>Reset</span>
        </button>
      ) : null}
      <Link href={kind.to} className="sb-cta">
        {kind.cta} <ArrowRight aria-hidden />
      </Link>
      <Link href={kind.exit} className="sb-exit" aria-label="Exit sample" onClick={clearSample}>
        <X aria-hidden /> <span>Exit sample</span>
      </Link>
    </div>
  )
}
