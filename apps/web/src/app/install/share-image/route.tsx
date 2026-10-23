import { readFile } from "node:fs/promises"
import path from "node:path"
import { ImageResponse } from "next/og"

export const runtime = "nodejs"

// The app's dark tokens (peerfolio-5c.css), so the card matches the invite previews and the product.
const C = {
  bg: "#0d0f11", panel: "#14171a", raise: "#1e2226", hair: "#2a3036", hair2: "#22272b",
  fg: "#f0f2f4", fg2: "#b4bcc5", fg3: "#939ca7", accent: "#98b8e7", inkFg: "#14181d",
}
const SERIF = "Newsreader"
const SANS = "Hanken"
const MONO = "Plex"

const dataUrl = (file: Buffer, type: string) => `data:${type};base64,${file.toString("base64")}`

const FILLER = ["#8aa4c8", "#c9a36b", "#7fae95", "#b88aa8", "#8d8fb8", "#c78a80", "#7ba7b3", "#a8b07a"]

function PhoneShell({ children, width, height }: { children: React.ReactNode; width: number; height: number }) {
  return (
    <div style={{ display: "flex", position: "relative", width, height, padding: 11, borderRadius: 56, background: "#121315", border: "2px solid #4a4d54", boxShadow: "0 30px 60px rgba(0,0,0,0.55)" }}>
      <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", borderRadius: 46, overflow: "hidden", background: C.bg }}>
        {children}
        <div style={{ position: "absolute", top: 13, left: width / 2 - 11 - 40, width: 80, height: 24, borderRadius: 12, background: "#000", display: "flex" }} />
      </div>
    </div>
  )
}

export async function GET() {
  const [serif, serifItalic, hanken, plex, logoFile, appShot, icon] = await Promise.all([
    readFile(path.join(process.cwd(), "src/assets/og-fonts/newsreader-latin-400-normal.woff")),
    readFile(path.join(process.cwd(), "src/assets/og-fonts/newsreader-latin-400-italic.woff")),
    readFile(path.join(process.cwd(), "src/assets/og-fonts/hanken-grotesk-latin-500-normal.woff")),
    readFile(path.join(process.cwd(), "src/assets/og-fonts/ibm-plex-mono-latin-500-normal.woff")),
    readFile(path.join(process.cwd(), "public/logo-white.png")),
    readFile(path.join(process.cwd(), "public/install/standalone-dark.jpg")),
    readFile(path.join(process.cwd(), "public/icons/icon-192.png")),
  ])
  const logo = dataUrl(logoFile, "image/png")
  const shot = dataUrl(appShot, "image/jpeg")
  const appIcon = dataUrl(icon, "image/png")
  const W = 292
  const H = 640

  return new ImageResponse(
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", background: C.bg, color: C.fg, fontFamily: SANS }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", backgroundImage: `linear-gradient(to right, ${C.hair2} 1px, transparent 1px), linear-gradient(to bottom, ${C.hair2} 1px, transparent 1px)`, backgroundSize: "56px 56px", opacity: 0.6, maskImage: "radial-gradient(ellipse 75% 80% at 70% 45%, #000 20%, transparent 100%)" }} />

      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600, padding: "52px 0 52px 56px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: SERIF, fontSize: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={40} height={40} alt="" />
          Peerfolio
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", alignSelf: "flex-start", gap: 10, padding: "7px 14px", borderRadius: 999, background: C.panel, border: `1px solid ${C.hair}`, color: C.fg2, fontSize: 15, letterSpacing: 2, fontFamily: MONO }}>
            <div style={{ display: "flex", width: 7, height: 7, borderRadius: 4, background: C.accent }} />
            INSTALL / NO APP STORE
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 22, fontFamily: SERIF, fontSize: 80, lineHeight: 1.04, letterSpacing: -2.5 }}>
            <div style={{ display: "flex" }}>Add it to your</div>
            <div style={{ display: "flex", color: C.accent, fontStyle: "italic" }}>home screen.</div>
          </div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 25, lineHeight: 1.4, color: C.fg2 }}>Opens full-screen like any app. Four taps, nothing to download.</div>
        </div>
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", padding: "16px 28px", borderRadius: 9, background: C.fg, color: C.inkFg, fontSize: 21 }}>See how it works →</div>
        </div>
      </div>

      <div style={{ position: "absolute", left: 600, top: 0, width: 600, height: 630, display: "flex", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 40, top: 96, display: "flex", transform: "rotate(-5deg)" }}>
          <PhoneShell width={W} height={H}>
            <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.raise, padding: "86px 22px 0" }}>
              <div style={{ display: "flex", justifyContent: "center", fontSize: 15, color: C.fg2 }}>Friday, October 23</div>
              <div style={{ display: "flex", flexWrap: "wrap", marginTop: 34, gap: 24 }}>
                {FILLER.slice(0, 4).concat(["pf"]).concat(FILLER.slice(4)).map((c, i) =>
                  c === "pf" ? (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 52 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={appIcon} width={52} height={52} alt="" style={{ borderRadius: 13, border: `2px solid ${C.accent}` }} />
                      <div style={{ display: "flex", marginTop: 6, fontSize: 12, color: C.fg }}>Peerfolio</div>
                    </div>
                  ) : (
                    <div key={i} style={{ display: "flex", width: 52, height: 52, borderRadius: 13, background: c, opacity: 0.85 }} />
                  ),
                )}
              </div>
            </div>
          </PhoneShell>
        </div>
        <div style={{ position: "absolute", left: 250, top: 50, display: "flex", transform: "rotate(3deg)" }}>
          <PhoneShell width={W} height={H}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot} width={W - 22} height={H - 22} alt="" style={{ objectFit: "cover", objectPosition: "top" }} />
          </PhoneShell>
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: SERIF, data: serif, weight: 400, style: "normal" },
        { name: SERIF, data: serifItalic, weight: 400, style: "italic" },
        { name: SANS, data: hanken, weight: 500, style: "normal" },
        { name: MONO, data: plex, weight: 500, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    },
  )
}
