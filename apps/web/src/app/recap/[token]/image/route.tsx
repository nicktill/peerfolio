import { readFile } from "node:fs/promises"
import path from "node:path"
import { ImageResponse } from "next/og"
import { loadPublicRecap } from "@web/lib/fantasy-season-view"
import { formatSigned } from "@web/lib/fantasy-season"

export const runtime = "nodejs"

const ACCENTS: Record<string, string> = { emerald: "#3fae7f", violet: "#8f6fe0", amber: "#e0a23f", sky: "#4aa3e0", rose: "#e0607a" }
const UP = "#6fcf9f"
const DOWN = "#e6a39d"

/**
 * The shareable round card: percentages and names only. No balances, no share
 * counts, no dollar amounts exist in a recap, so there is nothing to leak.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const found = await loadPublicRecap(token)
  if (!found) return new Response("Not found", { status: 404 })
  const { recap, league, seasonNumber } = found
  const accent = ACCENTS[league.accent] ?? ACCENTS.emerald!
  const logo = `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public/logo-white.png"))).toString("base64")}`
  const mono = "monospace"
  const rows = recap.table.slice(0, 5)
  const tone = (v: number) => (v > 0 ? UP : v < 0 ? DOWN : "#c9d0d9")
  const call = recap.bestDecision
  const unit = recap.mode === "draft" ? "Best pick" : "Best trade"

  return new ImageResponse(
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", background: "#08090b", color: "#f1f3f6", fontFamily: "sans-serif" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1200, height: 6, display: "flex", background: accent }} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560, padding: "54px 0 52px 56px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 700 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={38} height={38} alt="" />
          Peerfolio
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#8fb0e6", fontSize: 18, letterSpacing: 3, fontFamily: mono }}>{`SEASON ${seasonNumber}  /  ROUND ${recap.roundNumber}`}</div>
          <div style={{ display: "flex", marginTop: 8, color: "#a7b0bc", fontSize: 22 }}>{league.name.length > 34 ? `${league.name.slice(0, 33)}…` : league.name}</div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 56, lineHeight: 1.08, fontWeight: 700 }}>{recap.headline}</div>
          {call ? (
            <div style={{ display: "flex", marginTop: 26, fontSize: 22, color: "#a7b0bc" }}>
              {`${unit}: ${call.name} on ${call.ticker}`}
              <span style={{ display: "flex", marginLeft: 10, color: UP, fontWeight: 700 }}>{formatSigned(call.percent)}</span>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", color: "#8a95a3", fontSize: 18, fontFamily: mono }}>Percentages only. Never balances.</div>
      </div>

      <div style={{ position: "absolute", left: 640, top: 56, width: 500, height: 518, display: "flex", flexDirection: "column", padding: 24, borderRadius: 20, background: "#0e1116", border: "1px solid #232b36" }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#8a95a3", fontSize: 14, letterSpacing: 2, fontFamily: mono }}>
          <div style={{ display: "flex" }}>THE ROUND</div>
          <div style={{ display: "flex" }}>RETURN</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
          {rows.map((p) => (
            <div key={p.userId} style={{ display: "flex", alignItems: "center", padding: "13px 12px", borderRadius: 12, background: p.rank === 1 ? "#171d26" : "transparent" }}>
              <div style={{ display: "flex", width: 34, color: p.rank === 1 ? "#e0a21b" : "#8a95a3", fontSize: 22 }}>{p.rank}</div>
              <div style={{ display: "flex", flex: 1, fontSize: 26 }}>{p.name}</div>
              <div style={{ display: "flex", color: tone(p.percent), fontSize: 26, fontWeight: 700 }}>{formatSigned(p.percent)}</div>
            </div>
          ))}
        </div>
        {recap.leader ? (
          <div style={{ display: "flex", marginTop: "auto", padding: "14px 16px", borderRadius: 12, background: "#131820", border: "1px solid #1d242e", fontSize: 18, color: "#c9d0d9" }}>
            {`Season leader: ${recap.leader.name}`}
          </div>
        ) : null}
      </div>
    </div>,
    // A settled round never changes, so the card can be cached hard.
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  )
}
