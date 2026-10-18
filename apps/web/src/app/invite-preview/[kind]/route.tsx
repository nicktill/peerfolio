import { readFile } from "node:fs/promises"
import path from "node:path"
import { ImageResponse } from "next/og"
import { teamLook } from "@web/lib/sports/teams"

export const runtime = "nodejs"

// Charcoal surfaces with warm amber, the app's own palette. All data below is invented sample data.
const C = {
  bg: "#100f0e",
  panel: "#191715",
  panel2: "#211e1b",
  line: "#2e2a26",
  text: "#f4ede2",
  mute: "#9a9186",
  amber: "#e8a33d",
  amberDim: "#4a3516",
  green: "#6fcf9f",
}

const DISPLAY = "Bricolage"
const SANS = "Hanken"
const MONO = "Plex"

const fontCache = new Map<string, Buffer>()
async function font(file: string) {
  const hit = fontCache.get(file)
  if (hit) return hit
  const data = await readFile(path.join(process.cwd(), "src/assets/og-fonts", file))
  fontCache.set(file, data)
  return data
}

const logoCache = new Map<string, string | null>()
/** A team logo as a data URL, or null when it can't be fetched quickly (the card then shows the team colour + abbreviation). */
async function teamLogo(sport: string, name: string): Promise<string | null> {
  const url = teamLook(sport, name).logoDark ?? teamLook(sport, name).logo
  if (!url) return null
  if (logoCache.has(url)) return logoCache.get(url) ?? null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) throw new Error("bad logo")
    const data = `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`
    logoCache.set(url, data)
    return data
  } catch {
    return null
  }
}

function Mark({ logo, abbr, color, size }: { logo: string | null; abbr: string; color: string; size: number }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} width={size} height={size} alt="" />
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: size / 2, background: color, color: "#fff", fontFamily: DISPLAY, fontSize: size * 0.34 }}>{abbr}</div>
  )
}

function Side({ sport, name, logo, odds, pick, align }: { sport: string; name: string; logo: string | null; odds: string; pick?: boolean; align: "left" | "right" }) {
  const look = teamLook(sport, name)
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "left" ? "flex-start" : "flex-end", flex: 1, padding: "16px 18px", background: `linear-gradient(${align === "left" ? "100deg" : "260deg"}, ${look.color}66, ${look.color}10 70%)` }}>
      <Mark logo={logo} abbr={look.abbr} color={look.color} size={64} />
      <div style={{ display: "flex", marginTop: 8, fontFamily: DISPLAY, fontSize: 24, color: C.text }}>{look.abbr}</div>
      <div style={{ display: "flex", marginTop: 6, padding: "5px 12px", borderRadius: 8, fontFamily: MONO, fontSize: 22, color: pick ? "#1a1204" : C.text, background: pick ? C.amber : "#00000055", border: pick ? `1px solid ${C.amber}` : `1px solid ${C.line}` }}>{odds}</div>
    </div>
  )
}

function Notch({ side }: { side: "left" | "right" }) {
  return <div style={{ position: "absolute", top: -13, [side]: -13, width: 26, height: 26, borderRadius: 13, background: C.bg }} />
}

function SportsTicket({ away, home }: { away: string | null; home: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 540, borderRadius: 22, background: C.panel, border: `1px solid ${C.line}`, overflow: "hidden", transform: "rotate(1.6deg)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: MONO, fontSize: 13, letterSpacing: 3, color: C.mute }}>NFL / SUNDAY NIGHT</div>
          <div style={{ display: "flex", marginTop: 3, fontFamily: DISPLAY, fontSize: 30, color: C.text }}>Sunday Picks</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: "#2a1d0a", border: `1px solid ${C.amberDim}`, fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: C.amber }}>
          <div style={{ display: "flex", width: 8, height: 8, borderRadius: 4, background: C.amber }} />
          LIVE · Q3
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", padding: "16px 22px 0" }}>
        <div style={{ display: "flex", borderRadius: 16, overflow: "hidden", border: `1px solid ${C.line}`, background: C.panel2 }}>
          <Side sport="nfl" name="Buffalo Bills" logo={away} odds="+185" align="left" />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 54, fontFamily: MONO, fontSize: 14, color: C.mute }}>@</div>
          <Side sport="nfl" name="Kansas City Chiefs" logo={home} odds="-130" pick align="right" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: C.mute }}>
            <div style={{ display: "flex" }}>WIN PROBABILITY</div>
            <div style={{ display: "flex", color: C.amber }}>KC 62%</div>
          </div>
          <div style={{ display: "flex", marginTop: 7, height: 10, borderRadius: 5, overflow: "hidden", background: "#2a2622" }}>
            <div style={{ display: "flex", width: "38%", background: teamLook("nfl", "Buffalo Bills").color }} />
            <div style={{ display: "flex", width: 3, background: C.panel }} />
            <div style={{ display: "flex", flex: 1, background: C.amber }} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, padding: "12px 16px", borderRadius: 14, background: "#2a1d0a", border: `1px solid ${C.amberDim}` }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: C.amber }}>YOUR PICK · $250</div>
            <div style={{ display: "flex", marginTop: 3, fontFamily: DISPLAY, fontSize: 24, color: C.text }}>Chiefs to win</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: C.mute }}>TO WIN</div>
            <div style={{ display: "flex", marginTop: 3, fontFamily: DISPLAY, fontSize: 28, color: C.green }}>+$192.31</div>
          </div>
        </div>
      </div>

      {/* Perforation */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", marginTop: 18, height: 2 }}>
        <Notch side="left" />
        <Notch side="right" />
        <div style={{ display: "flex", flex: 1, margin: "0 22px", borderTop: `2px dashed ${C.line}` }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px", borderRadius: 8, border: `2px solid ${C.amber}`, color: C.amber, fontFamily: MONO, fontSize: 16, letterSpacing: 4, transform: "rotate(-3deg)" }}>LOCKED</div>
        <div style={{ display: "flex", gap: 14, fontFamily: MONO, fontSize: 15 }}>
          {[["1", "Maya", "1,420"], ["2", "You", "1,260"], ["3", "Priya", "1,115"]].map(([r, n, v]) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 6, color: n === "You" ? C.amber : C.mute }}>
              <div style={{ display: "flex", color: r === "1" ? C.amber : C.mute }}>{r}</div>
              <div style={{ display: "flex", color: n === "You" ? C.text : C.mute }}>{n}</div>
              <div style={{ display: "flex" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const LEAGUE_ROWS = [
  { rank: 1, name: "Maya", ret: 8.95, color: "#e8a33d" },
  { rank: 2, name: "Priya", ret: 5.28, color: "#d98e5b" },
  { rank: 3, name: "You", ret: 2.64, color: "#f4ede2" },
  { rank: 4, name: "DeShawn", ret: 1.52, color: "#9a9186" },
]

/** Stock leagues show returns only, never balances: bars scaled to the leader. */
function LeagueCard({ fantasy }: { fantasy: boolean }) {
  const rows = fantasy ? [...LEAGUE_ROWS.slice(0, 2), { rank: 3, name: "You", ret: 4.1, color: "#f4ede2" }, ...LEAGUE_ROWS.slice(3)].sort((a, b) => b.ret - a.ret).map((r, i) => ({ ...r, rank: i + 1 })) : LEAGUE_ROWS
  const picks = [["NVDA", "+3.8%"], ["AAPL", "+1.2%"], ["TSLA", "-0.9%"]]
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 540, padding: 24, borderRadius: 22, background: C.panel, border: `1px solid ${C.line}`, transform: "rotate(1.2deg)" }}>
      <div style={{ display: "flex", fontFamily: MONO, fontSize: 13, letterSpacing: 3, color: C.mute }}>{fantasy ? "FANTASY / PLAY MONEY" : "LEAGUE / LAST 30 DAYS"}</div>
      <div style={{ display: "flex", marginTop: 4, fontFamily: DISPLAY, fontSize: 38, color: C.text }}>{fantasy ? "Friday Draft" : "The Group Chat"}</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 18, gap: 10 }}>
        {rows.map((r) => (
          <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, background: r.name === "You" ? C.panel2 : "transparent", border: r.name === "You" ? `1px solid ${C.amberDim}` : "1px solid transparent" }}>
            <div style={{ display: "flex", width: 22, fontFamily: MONO, fontSize: 18, color: r.rank === 1 ? C.amber : C.mute }}>{r.rank}</div>
            <div style={{ display: "flex", width: 112, fontFamily: DISPLAY, fontSize: 22, color: C.text }}>{r.name}</div>
            <div style={{ display: "flex", flex: 1, height: 12, borderRadius: 6, background: "#2a2622" }}>
              <div style={{ display: "flex", width: `${Math.max(12, (r.ret / rows[0].ret) * 100)}%`, borderRadius: 6, background: r.color }} />
            </div>
            <div style={{ display: "flex", width: 84, justifyContent: "flex-end", fontFamily: MONO, fontSize: 19, color: C.green }}>+{r.ret.toFixed(2)}%</div>
          </div>
        ))}
      </div>
      {fantasy ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 18, paddingTop: 16, borderTop: `1px dashed ${C.line}` }}>
          <div style={{ display: "flex", fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: C.mute }}>YOUR DRAFT / $100K PLAY MONEY</div>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            {picks.map(([t, v]) => (
              <div key={t} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "10px 12px", borderRadius: 12, background: C.panel2, border: `1px solid ${C.line}` }}>
                <div style={{ display: "flex", fontFamily: DISPLAY, fontSize: 22, color: C.text }}>{t}</div>
                <div style={{ display: "flex", marginTop: 2, fontFamily: MONO, fontSize: 16, color: v.startsWith("-") ? "#e07a6a" : C.green }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", marginTop: 16, paddingTop: 14, borderTop: `1px dashed ${C.line}`, fontFamily: MONO, fontSize: 14, letterSpacing: 1, color: C.mute }}>RETURNS ONLY · BALANCES STAY PRIVATE</div>
      )}
    </div>
  )
}

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params
  if (kind !== "league" && kind !== "fantasy" && kind !== "sports") return new Response("Not found", { status: 404 })
  const sports = kind === "sports"
  const fantasy = kind === "fantasy"
  const [logoFile, bricolage, hanken, plex, away, home] = await Promise.all([
    readFile(path.join(process.cwd(), "public/logo-white.png")),
    font("bricolage-grotesque-latin-700-normal.woff"),
    font("hanken-grotesk-latin-600-normal.woff"),
    font("ibm-plex-mono-latin-500-normal.woff"),
    sports ? teamLogo("nfl", "Buffalo Bills") : Promise.resolve(null),
    sports ? teamLogo("nfl", "Kansas City Chiefs") : Promise.resolve(null),
  ])
  const logo = `data:image/png;base64,${logoFile.toString("base64")}`

  const kicker = sports ? "SPORTS / PLAY CREDITS" : fantasy ? "FANTASY / PLAY MONEY" : "PRIVATE LEAGUE"
  const headA = "You're invited"
  const headB = sports ? "to the slip." : fantasy ? "to the draft." : "to the league."
  const sub = sports
    ? "Lock in picks on real games with play credits. Beat your friends on the board."
    : fantasy
      ? "Draft stocks with $100k of play money and race your friends."
      : "Race friends on returns. They see how well you invest, never how much."

  return new ImageResponse(
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", background: `radial-gradient(900px 600px at 85% 20%, #2a1e0e 0%, ${C.bg} 60%)`, color: C.text, fontFamily: SANS }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 520, padding: "52px 0 52px 56px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: DISPLAY, fontSize: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={40} height={40} alt="" />
          Peerfolio
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: C.amber, fontSize: 18, letterSpacing: 4, fontFamily: MONO }}>{kicker}</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 18, fontFamily: DISPLAY, fontSize: 68, lineHeight: 1.02 }}>
            <div style={{ display: "flex" }}>{headA}</div>
            <div style={{ display: "flex", color: C.amber }}>{headB}</div>
          </div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 24, lineHeight: 1.4, color: C.mute }}>{sub}</div>
        </div>
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", padding: "16px 28px", borderRadius: 12, background: C.amber, color: "#1a1204", fontFamily: DISPLAY, fontSize: 23 }}>Open your invitation →</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 590, top: sports ? 40 : 60, display: "flex" }}>
        {sports ? <SportsTicket away={away} home={home} /> : <LeagueCard fantasy={fantasy} />}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: DISPLAY, data: bricolage, weight: 700, style: "normal" },
        { name: SANS, data: hanken, weight: 600, style: "normal" },
        { name: MONO, data: plex, weight: 500, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    },
  )
}
