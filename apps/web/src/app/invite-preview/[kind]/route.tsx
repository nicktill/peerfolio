import { ImageResponse } from "next/og"
import { inviteCopy } from "@web/lib/invite-metadata"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params
  if (kind !== "league" && kind !== "fantasy") return new Response("Not found", { status: 404 })
  const fantasy = kind === "fantasy"
  const { title } = inviteCopy(kind)
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 68px", background: "#101714", color: "#f5f7f5", fontFamily: "sans-serif", border: "2px solid #2a4236" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, borderRadius: 14, background: "#2cc69b", color: "#101714" }}>P</div>
        Peerfolio
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", color: "#62dfb8", fontSize: 22, letterSpacing: 4 }}>YOUR INVITATION IS HERE</div>
        <div style={{ display: "flex", maxWidth: 960, fontSize: 72, lineHeight: 1.08, fontWeight: 700 }}>{title}.</div>
        <div style={{ display: "flex", fontSize: 28, color: "#b7c4bd" }}>{fantasy ? "Play money. Real competition. Bring your friends." : "Compare returns with friends. Keep your balances private."}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 23 }}>
        <div style={{ display: "flex", padding: "16px 24px", background: "#2cc69b", color: "#101714", borderRadius: 14, fontWeight: 700 }}>Open your invitation →</div>
        <div style={{ display: "flex", color: "#b7c4bd" }}>peerfolio.org</div>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  )
}
