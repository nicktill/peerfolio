import { ImageResponse } from "next/og"

export const runtime = "nodejs"

/** Sample standings only: the card is public, so nothing here comes from a real league. */
const ROWS = [
  { rank: 1, name: "You", ret: "+9.70%", you: true },
  { rank: 2, name: "Maya", ret: "+7.12%", you: false },
  { rank: 3, name: "Dev", ret: "+3.48%", you: false },
]

/** Link-preview card for the landing page, in the 5C look the site uses. */
export async function GET() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 72px", background: "#eceff2", color: "#202a34", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 650 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 700, color: "#25364b" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 12, background: "#25364b", color: "#f9fafb", fontSize: 26 }}>P</div>
          Peerfolio
        </div>
        <div style={{ display: "flex", marginTop: 44, fontSize: 70, lineHeight: 1.06, fontWeight: 700, letterSpacing: -2, color: "#202a34" }}>Track your investments with friends.</div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 27, lineHeight: 1.35, color: "#4a5967" }}>Friends see how well you invest, never how much.</div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 24, color: "#3867a1", fontWeight: 700 }}>peerfolio.org</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", width: 390, padding: "26px 28px", background: "#f9fafb", border: "2px solid #d6dce3", borderRadius: 22 }}>
        <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#202a34" }}>Standings</div>
        <div style={{ display: "flex", fontSize: 18, color: "#5b6b7c", marginTop: 4 }}>Last 30 days · everyone indexed to 100</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 18, gap: 10 }}>
          {ROWS.map((r) => (
            <div key={r.rank} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 14, background: r.you ? "#e3ebf5" : "#edf0f4" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, fontWeight: 700 }}>
                <div style={{ display: "flex", width: 26, color: "#5b6b7c" }}>{r.rank}</div>
                {r.name}
              </div>
              <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: "#286549" }}>{r.ret}</div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  )
}
