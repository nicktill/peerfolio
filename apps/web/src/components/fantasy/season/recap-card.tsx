"use client"

import { useState } from "react"
import { ArrowUpRight, Check, Crown, Download, Link2, Share2, Skull, Sparkles, Trophy } from "lucide-react"
import { useToast } from "@web/components/ui/toast"
import { formatPercent } from "@web/lib/format"
import { visibleReturn } from "@web/lib/return-display"
import { formatPoints } from "@web/components/fantasy/season/season-format"
import type { RoundRecap } from "@web/lib/fantasy-season"

const tone = (v: number) => (visibleReturn(v) > 0 ? "fw-up" : visibleReturn(v) < 0 ? "fw-down" : undefined)

/** The week in four lines, with a share link to the percentage-only card. */
export function RecapCard({ recap, token, accent, shareable = true }: { recap: RoundRecap; token: string; accent: string; shareable?: boolean }) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = `${window.location.origin}/recap/${token}`
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: recap.headline, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      // Closing the share sheet is not an error.
      if (error instanceof DOMException && error.name === "AbortError") return
      toast("Couldn't copy that link.", "error")
    }
  }

  const unit = recap.mode === "draft" ? "pick" : "trade"
  return (
    <section className="fw-panel fs-recap fs-accent" data-accent={accent} aria-labelledby={`fs-recap-${recap.roundNumber}`}>
      <div className="fs-recap-band">
        <span className="fw-eyebrow">Round {recap.roundNumber} / Recap</span>
        <h3 id={`fs-recap-${recap.roundNumber}`}>{recap.headline}</h3>
      </div>
      <div className="fs-recap-body">
        {recap.overtakes.length > 0 ? (
          <div className="fs-moment">
            <span className="fs-moment-ic">
              <ArrowUpRight aria-hidden />
            </span>
            <p>
              <small>Overtakes</small>
              {recap.overtakes.map((o, i) => (
                <span key={`${o.who.userId}-${o.passed.userId}`}>
                  {i > 0 ? ", " : ""}
                  <b>{o.who.name}</b> passed {o.passed.name}
                </span>
              ))}
            </p>
          </div>
        ) : null}
        {recap.loser ? (
          <div className="fs-moment">
            <span className="fs-moment-ic">
              <Skull aria-hidden />
            </span>
            <p>
              <small>Rough week</small>
              <b>{recap.loser.name}</b> <span className={tone(recap.loser.percent)}>{formatPercent(recap.loser.percent, 2)}</span>
            </p>
          </div>
        ) : null}
        {recap.bestDecision ? (
          <div className="fs-moment">
            <span className="fs-moment-ic">
              <Sparkles aria-hidden />
            </span>
            <p>
              <small>Best {unit}</small>
              <b>{recap.bestDecision.name}</b> on {recap.bestDecision.ticker} <span className={tone(recap.bestDecision.percent)}>{formatPercent(recap.bestDecision.percent, 2)}</span>
            </p>
          </div>
        ) : null}
        {recap.worstDecision ? (
          <div className="fs-moment">
            <span className="fs-moment-ic">
              <Trophy aria-hidden style={{ transform: "rotate(180deg)" }} />
            </span>
            <p>
              <small>Worst {unit}</small>
              <b>{recap.worstDecision.name}</b> on {recap.worstDecision.ticker} <span className={tone(recap.worstDecision.percent)}>{formatPercent(recap.worstDecision.percent, 2)}</span>
            </p>
          </div>
        ) : null}
        {recap.leader ? (
          <div className="fs-moment">
            <span className="fs-moment-ic">
              <Crown aria-hidden />
            </span>
            <p>
              <small>Season leader</small>
              <b>{recap.leader.name}</b> with {formatPoints(recap.leader.points)} pts
            </p>
          </div>
        ) : null}
        {shareable ? (
          <div className="fs-recap-foot">
            <button type="button" className="fw-btn" data-solid onClick={share}>
              {copied ? <Check aria-hidden /> : typeof navigator !== "undefined" && "share" in navigator ? <Share2 aria-hidden /> : <Link2 aria-hidden />}
              {copied ? "Link copied" : "Share recap"}
            </button>
            <a className="fw-btn" href={`/recap/${token}/image`} target="_blank" rel="noreferrer" download={`peerfolio-round-${recap.roundNumber}.png`}>
              <Download aria-hidden /> Image
            </a>
          </div>
        ) : null}
      </div>
    </section>
  )
}
