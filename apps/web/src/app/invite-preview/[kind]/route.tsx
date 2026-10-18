import { readFile } from "node:fs/promises"
import path from "node:path"
import { ImageResponse } from "next/og"

export const runtime = "nodejs"

const PLAYERS = [
  { rank: 1, initials: "MC", name: "Maya", ret: "+8.95%", color: "#4c8df6" },
  { rank: 2, initials: "PR", name: "Priya", ret: "+5.28%", color: "#e0a21b" },
  { rank: 3, initials: "NT", name: "You", ret: "+2.64%", color: "#f1f3f6" },
  { rank: 4, initials: "DE", name: "DeShawn", ret: "+1.52%", color: "#9b7cf0" },
]

// Race-chart lines for the preview window, one per player (same order as PLAYERS).
const LINES = [
  "M0 118 C60 112 110 100 170 80 S260 40 330 16",
  "M0 118 C60 114 120 104 180 92 S270 70 330 62",
  "M0 118 C70 116 120 108 190 100 S270 98 330 96",
  "M0 118 C70 118 130 114 190 108 S270 108 330 106",
]

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params
  if (kind !== "league" && kind !== "fantasy" && kind !== "sports") return new Response("Not found", { status: 404 })
  const fantasy = kind === "fantasy" || kind === "sports"
  const sports = kind === "sports"
  const logo = `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public/logo-white.png"))).toString("base64")}`
  const mono = "monospace"

  return new ImageResponse(
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", background: "#08090b", color: "#f1f3f6", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 480, padding: "52px 0 52px 56px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 32, fontWeight: 700 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={40} height={40} alt="" />
          Peerfolio
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#8fb0e6", fontSize: 19, letterSpacing: 3, fontFamily: mono }}>{sports ? "SPORTS / PLAY CREDITS" : fantasy ? "FANTASY / PLAY MONEY" : "PRIVATE LEAGUE"}</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 18, fontSize: 62, lineHeight: 1.04, fontWeight: 700 }}>
            <div style={{ display: "flex" }}>You&apos;re invited</div>
            <div style={{ display: "flex", color: "#8fb0e6" }}>{fantasy ? "to the draft." : "to the league."}</div>
          </div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 24, lineHeight: 1.4, color: "#a7b0bc" }}>
            {sports ? "Make picks with play credits and climb the leaderboard." : fantasy ? "Pick stocks with $100k of play money and race your friends." : "Race friends on returns. They see how well you invest, never how much."}
          </div>
        </div>
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", padding: "16px 28px", borderRadius: 12, background: "#eef2f8", color: "#08090b", fontSize: 23, fontWeight: 700 }}>Open your invitation →</div>
        </div>
      </div>

      <div style={{ position: "absolute", left: 540, top: 56, width: 620, height: 600, display: "flex", flexDirection: "column", padding: 22, borderRadius: 20, background: "#0e1116", border: "1px solid #232b36" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#8a95a3", fontSize: 14, letterSpacing: 2, fontFamily: mono }}>{sports ? "SPORTS / PLAY CREDITS" : fantasy ? "FANTASY / PLAY MONEY" : "LEAGUE / LAST 30 DAYS"}</div>
          <div style={{ display: "flex", marginTop: 6, fontSize: 38, fontWeight: 700 }}>{sports ? "Sunday Picks" : fantasy ? "Friday Draft" : "The Group Chat"}</div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
          {(fantasy ? [["YOUR RANK", "#3 of 5"], ["YOUR RETURN", "+2.64%"], ["VALUE", sports ? "1,026" : "$102,640"]] : [["YOUR RANK", "#1 of 4"], ["YOUR RETURN", "+9.70%"], ["PLAYERS", "4"]]).map(([label, value], i) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "12px 14px", borderRadius: 12, background: "#131820", border: "1px solid #1d242e" }}>
              <div style={{ display: "flex", color: "#8a95a3", fontSize: 12, letterSpacing: 2, fontFamily: mono }}>{label}</div>
              <div style={{ display: "flex", marginTop: 4, fontSize: 28, fontWeight: 700, color: i === 1 ? "#6fcf9f" : "#f1f3f6" }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 14, padding: "14px 16px", borderRadius: 12, background: "#131820", border: "1px solid #1d242e" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, color: "#c9d0d9" }}>
            <div style={{ display: "flex" }}>The race</div>
            <div style={{ display: "flex", color: "#8a95a3", fontSize: 12, fontFamily: mono }}>EVERYONE STARTS AT 100</div>
          </div>
          <svg width="570" height="130" viewBox="0 0 330 130" style={{ marginTop: 8 }}>
            <path d="M0 118 L330 118" stroke="#232b36" strokeWidth="1" strokeDasharray="3 4" fill="none" />
            {LINES.map((d, i) => (
              <path key={d} d={d} stroke={PLAYERS[i].color} strokeWidth={i === 2 ? 2.6 : 2} fill="none" />
            ))}
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
          {PLAYERS.map((p) => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", padding: "9px 12px", borderRadius: 10, background: p.name === "You" ? "#171d26" : "transparent" }}>
              <div style={{ display: "flex", width: 24, color: p.rank === 1 ? "#e0a21b" : "#8a95a3", fontSize: 16 }}>{p.rank}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 15, background: "#1d242e", fontSize: 12, color: "#c9d0d9" }}>{p.initials}</div>
              <div style={{ display: "flex", marginLeft: 12, flex: 1, fontSize: 18 }}>{p.name}</div>
              <div style={{ display: "flex", color: "#6fcf9f", fontSize: 18, fontWeight: 700 }}>{p.ret}</div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  )
}
