import type { Metadata } from "next"
import { notFound } from "next/navigation"
import "@web/components/fantasy/fantasy-workspace.css"
import "@web/components/fantasy/season/fantasy-season.css"
import { EmptyGhost } from "@web/components/ui/empty-ghost"
import { SampleLink } from "@web/components/sample/sample-link"
import { Sparkles, Trophy, Users } from "lucide-react"
import { EmptyScene } from "@web/components/ui/empty-scene"
import { LeagueMark } from "@web/components/league/league-mark"
import { Cup } from "@web/components/fantasy/season/season-parts"

export const metadata: Metadata = { title: "Character preview", robots: { index: false, follow: false } }

/** The empty-state scenes and the trophy shelf, side by side, to look at without needing empty data. Not in production builds. */
export default function CharacterPreview() {
  if (process.env.VERCEL_ENV === "production" || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")) notFound()
  return (
    <div style={{ minHeight: "100vh", padding: 32, background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>
      <div className="fw" data-accent="emerald" style={{ maxWidth: 900, margin: "0 auto", width: "100%" }}>
        <h1>Character preview</h1>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <section className="fw-panel"><EmptyScene kind="leagues" title="No fantasy leagues yet" body="Start a league, send the invite, let the returns talk." /></section>
          <section className="fw-panel"><EmptyScene kind="picks" title="No picks yet" body="Tap a line to start a pick." /></section>
          <section className="fw-panel"><EmptyScene kind="trophies" title="The shelf is empty" body="Win a round to put the first cup on it." /></section>
          <section className="fw-panel"><EmptyScene kind="feed" title="Quiet in here" body="Someone make the first move." /></section>
        </div>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <section className="fw-panel"><EmptyGhost kind="portfolio" icon={Sparkles} title="Let's see your portfolio" body="Add an account and type in what you hold. We price it every night and start your track record today." actions={<SampleLink href="/dashboard/sample" />} /></section>
          <section className="fw-panel"><EmptyGhost kind="board" icon={Trophy} title="The board is still filling up" body="Traders show up after 7 days of verified history." actions={<SampleLink href="/board/sample" />} /></section>
          <section className="fw-panel"><EmptyGhost kind="leagues" icon={Users} title="Start your first league" body="Pick a few friends, send the invite, and compare returns as percentages." actions={<SampleLink href="/leagues/sample">See a sample league</SampleLink>} /></section>
        </div>
        <section className="fw-panel" style={{ padding: 20, display: "flex", gap: 20, flexWrap: "wrap" }}>
          {["shield", "circle", "hex", "diamond"].map((shape, i) => (
            <LeagueMark key={shape} value={`crest:${shape}:${["trophy", "flame", "rocket", "crown"][i]}:${["glow", "float", "shimmer", "still"][i]}:none`} accent={["emerald", "violet", "amber", "rose"][i]!} size={64} />
          ))}
        </section>
        <section className="fw-panel" style={{ padding: 20 }}>
          <div className="fs-case"><div className="fs-shelf"><div className="fs-shelf-row">
            {(["round_win", "round_win", "hat_trick", "season_champion", "season_runner_up", "round_win"] as const).map((k, i) => (
              <Cup key={i} index={i} kind={k} label={k === "season_champion" || k === "season_runner_up" ? "S1" : `R${i + 1}`} />
            ))}
          </div></div></div>
        </section>
      </div>
    </div>
  )
}
