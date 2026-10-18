import { readFile } from "node:fs/promises"
import path from "node:path"
import { ImageResponse } from "next/og"
import { teamLook } from "@web/lib/sports/teams"

export const runtime = "nodejs"

// The app's own dark tokens (peerfolio-5c.css): charcoal surfaces, hairlines, periwinkle accent. All data below is invented sample data.
const C = {
  bg: "#0d0f11",
  panel: "#14171a",
  raise: "#1e2226",
  hair: "#2a3036",
  hair2: "#22272b",
  line: "#3b434b",
  fg: "#f0f2f4",
  fg2: "#b4bcc5",
  fg3: "#939ca7",
  accent: "#98b8e7",
  accentSoft: "rgba(152,184,231,0.14)",
  accentLine: "rgba(152,184,231,0.45)",
  gain: "#94c8af",
  loss: "#e6a39d",
  inkFg: "#14181d",
}

const SERIF = "Newsreader"
const SANS = "Hanken"
const MONO = "Plex"

const fontCache = new Map<string, Buffer>()
// Literal paths so Next's file tracing bundles the font files with this route.
async function font(name: "serif" | "serifItalic" | "sans" | "mono") {
  const hit = fontCache.get(name)
  if (hit) return hit
  const data = await (name === "serif"
    ? readFile(path.join(process.cwd(), "src/assets/og-fonts/newsreader-latin-400-normal.woff"))
    : name === "serifItalic"
      ? readFile(path.join(process.cwd(), "src/assets/og-fonts/newsreader-latin-400-italic.woff"))
      : name === "sans"
        ? readFile(path.join(process.cwd(), "src/assets/og-fonts/hanken-grotesk-latin-500-normal.woff"))
        : readFile(path.join(process.cwd(), "src/assets/og-fonts/ibm-plex-mono-latin-500-normal.woff")))
  fontCache.set(name, data)
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: size / 2, background: color, color: "#fff", fontFamily: SERIF, fontSize: size * 0.34 }}>{abbr}</div>
  )
}

function Side({ sport, name, logo, odds, pick, align }: { sport: string; name: string; logo: string | null; odds: string; pick?: boolean; align: "left" | "right" }) {
  const look = teamLook(sport, name)
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "left" ? "flex-start" : "flex-end", flex: 1, padding: "16px 18px", background: `linear-gradient(${align === "left" ? "100deg" : "260deg"}, ${look.color}66, ${look.color}10 70%)` }}>
      <Mark logo={logo} abbr={look.abbr} color={look.color} size={64} />
      <div style={{ display: "flex", marginTop: 8, fontFamily: SERIF, fontSize: 24, color: C.fg }}>{look.abbr}</div>
      <div style={{ display: "flex", marginTop: 6, padding: "5px 12px", borderRadius: 4, fontFamily: MONO, fontSize: 22, color: pick ? C.accent : C.fg, background: pick ? C.accentSoft : "rgba(0,0,0,0.3)", border: pick ? `1px solid ${C.accentLine}` : `1px solid ${C.hair}` }}>{odds}</div>
    </div>
  )
}

function Notch({ side }: { side: "left" | "right" }) {
  return <div style={{ position: "absolute", top: -13, [side]: -13, width: 26, height: 26, borderRadius: 13, background: C.bg, border: `1px solid ${C.hair}` }} />
}

function SportsTicket({ away, home }: { away: string | null; home: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 540, borderRadius: 14, background: C.panel, border: `1px solid ${C.hair}`, overflow: "hidden", transform: "rotate(1deg)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px", borderBottom: `1px solid ${C.hair}` }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: MONO, fontSize: 13, letterSpacing: 3, color: C.fg3 }}>NFL / SUNDAY NIGHT</div>
          <div style={{ display: "flex", marginTop: 3, fontFamily: SERIF, fontSize: 32, color: C.fg }}>Sunday Picks</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: C.accentSoft, border: `1px solid ${C.accentLine}`, fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: C.accent }}>
          <div style={{ display: "flex", width: 8, height: 8, borderRadius: 4, background: C.accent }} />
          LIVE · Q3
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", padding: "16px 22px 0" }}>
        <div style={{ display: "flex", borderRadius: 14, overflow: "hidden", border: `1px solid ${C.hair}`, background: C.raise }}>
          <Side sport="nfl" name="Buffalo Bills" logo={away} odds="+185" align="left" />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 54, fontFamily: MONO, fontSize: 14, color: C.fg3 }}>@</div>
          <Side sport="nfl" name="Kansas City Chiefs" logo={home} odds="-130" pick align="right" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: C.fg3 }}>
            <div style={{ display: "flex" }}>WIN PROBABILITY</div>
            <div style={{ display: "flex", color: C.accent }}>KC 62%</div>
          </div>
          <div style={{ display: "flex", marginTop: 7, height: 10, borderRadius: 5, overflow: "hidden", background: C.hair2 }}>
            <div style={{ display: "flex", width: "38%", background: teamLook("nfl", "Buffalo Bills").color }} />
            <div style={{ display: "flex", width: 3, background: C.panel }} />
            <div style={{ display: "flex", flex: 1, background: C.accent }} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, padding: "12px 16px", borderRadius: 9, background: C.accentSoft, border: `1px solid ${C.accentLine}` }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: C.accent }}>YOUR PICK · $250</div>
            <div style={{ display: "flex", marginTop: 3, fontFamily: SERIF, fontSize: 24, color: C.fg }}>Chiefs to win</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: C.fg3 }}>TO WIN</div>
            <div style={{ display: "flex", marginTop: 3, fontFamily: SERIF, fontSize: 28, color: C.gain }}>+$192.31</div>
          </div>
        </div>
      </div>

      {/* Perforation */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", marginTop: 18, height: 2 }}>
        <Notch side="left" />
        <Notch side="right" />
        <div style={{ display: "flex", flex: 1, margin: "0 22px", borderTop: `2px dashed ${C.hair}` }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px", borderRadius: 8, border: `2px solid ${C.accent}`, color: C.accent, fontFamily: MONO, fontSize: 16, letterSpacing: 4, transform: "rotate(-3deg)" }}>LOCKED</div>
        <div style={{ display: "flex", gap: 14, fontFamily: MONO, fontSize: 15 }}>
          {[["1", "Maya", "1,420"], ["2", "You", "1,260"], ["3", "Priya", "1,115"]].map(([r, n, v]) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 6, color: n === "You" ? C.accent : C.fg3 }}>
              <div style={{ display: "flex", color: r === "1" ? C.accent : C.fg3 }}>{r}</div>
              <div style={{ display: "flex", color: n === "You" ? C.fg : C.fg3 }}>{n}</div>
              <div style={{ display: "flex" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const LEAGUE_ROWS = [
  { rank: 1, name: "Maya", ret: 8.95, color: C.accent },
  { rank: 2, name: "Priya", ret: 5.28, color: "#7f9ccb" },
  { rank: 3, name: "You", ret: 2.64, color: C.fg },
  { rank: 4, name: "DeShawn", ret: 1.52, color: C.line },
]

/** Stock leagues show returns only, never balances: bars scaled to the leader. */
function LeagueCard({ fantasy }: { fantasy: boolean }) {
  const rows = fantasy ? [...LEAGUE_ROWS.slice(0, 2), { rank: 3, name: "You", ret: 4.1, color: C.fg }, ...LEAGUE_ROWS.slice(3)].sort((a, b) => b.ret - a.ret).map((r, i) => ({ ...r, rank: i + 1 })) : LEAGUE_ROWS
  const picks = [["NVDA", "+3.8%"], ["AAPL", "+1.2%"], ["TSLA", "-0.9%"]]
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 540, padding: 24, borderRadius: 14, background: C.panel, border: `1px solid ${C.hair}`, transform: "rotate(0.8deg)" }}>
      <div style={{ display: "flex", fontFamily: MONO, fontSize: 13, letterSpacing: 3, color: C.fg3 }}>{fantasy ? "STANDINGS / THIS WEEK" : "STANDINGS / LAST 30 DAYS"}</div>
      <div style={{ display: "flex", marginTop: 4, fontFamily: SERIF, fontSize: 38, color: C.fg }}>{fantasy ? "Friday Draft" : "The Group Chat"}</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 18, gap: 10 }}>
        {rows.map((r) => (
          <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 9, background: r.name === "You" ? C.raise : "transparent", border: r.name === "You" ? `1px solid ${C.accentLine}` : "1px solid transparent" }}>
            <div style={{ display: "flex", width: 22, fontFamily: MONO, fontSize: 18, color: r.rank === 1 ? C.accent : C.fg3 }}>{r.rank}</div>
            <div style={{ display: "flex", width: 112, fontFamily: SERIF, fontSize: 22, color: C.fg }}>{r.name}</div>
            <div style={{ display: "flex", flex: 1, height: 12, borderRadius: 6, background: C.hair2 }}>
              <div style={{ display: "flex", width: `${Math.max(12, (r.ret / rows[0].ret) * 100)}%`, borderRadius: 6, background: r.color }} />
            </div>
            <div style={{ display: "flex", width: 84, justifyContent: "flex-end", fontFamily: MONO, fontSize: 19, color: C.gain }}>+{r.ret.toFixed(2)}%</div>
          </div>
        ))}
      </div>
      {fantasy ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 18, paddingTop: 16, borderTop: `1px dashed ${C.hair}` }}>
          <div style={{ display: "flex", fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: C.fg3 }}>YOUR DRAFT / $100K PLAY MONEY</div>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            {picks.map(([t, v]) => (
              <div key={t} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "10px 12px", borderRadius: 9, background: C.raise, border: `1px solid ${C.hair}` }}>
                <div style={{ display: "flex", fontFamily: SERIF, fontSize: 22, color: C.fg }}>{t}</div>
                <div style={{ display: "flex", marginTop: 2, fontFamily: MONO, fontSize: 16, color: v.startsWith("-") ? C.loss : C.gain }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", marginTop: 16, paddingTop: 14, borderTop: `1px dashed ${C.hair}`, fontFamily: MONO, fontSize: 14, letterSpacing: 1, color: C.fg3 }}>RETURNS ONLY · BALANCES STAY PRIVATE</div>
      )}
    </div>
  )
}

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params
  if (kind !== "league" && kind !== "fantasy" && kind !== "sports") return new Response("Not found", { status: 404 })
  const sports = kind === "sports"
  const fantasy = kind === "fantasy"
  const [logoFile, serif, serifItalic, hanken, plex, away, home] = await Promise.all([
    readFile(path.join(process.cwd(), "public/logo-white.png")),
    font("serif"),
    font("serifItalic"),
    font("sans"),
    font("mono"),
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
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", background: C.bg, color: C.fg, fontFamily: SANS }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", backgroundImage: `linear-gradient(to right, ${C.hair2} 1px, transparent 1px), linear-gradient(to bottom, ${C.hair2} 1px, transparent 1px)`, backgroundSize: "56px 56px", opacity: 0.6, maskImage: "radial-gradient(ellipse 75% 80% at 62% 45%, #000 20%, transparent 100%)" }} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 520, padding: "52px 0 52px 56px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: SERIF, fontSize: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={40} height={40} alt="" />
          Peerfolio
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", alignSelf: "flex-start", gap: 10, padding: "7px 14px", borderRadius: 999, background: C.panel, border: `1px solid ${C.hair}`, color: C.fg2, fontSize: 15, letterSpacing: 2, fontFamily: MONO }}>
            <div style={{ display: "flex", width: 7, height: 7, borderRadius: 4, background: C.accent }} />
            {kicker}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 22, fontFamily: SERIF, fontSize: 72, lineHeight: 1.06, letterSpacing: -2 }}>
            <div style={{ display: "flex" }}>{headA}</div>
            <div style={{ display: "flex", color: C.accent, fontStyle: "italic" }}>{headB}</div>
          </div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 24, lineHeight: 1.4, color: C.fg2 }}>{sub}</div>
        </div>
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", padding: "16px 28px", borderRadius: 9, background: C.fg, color: C.inkFg, fontFamily: SANS, fontSize: 21 }}>Open your invitation →</div>
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
        { name: SERIF, data: serif, weight: 400, style: "normal" },
        { name: SERIF, data: serifItalic, weight: 400, style: "italic" },
        { name: SANS, data: hanken, weight: 500, style: "normal" },
        { name: MONO, data: plex, weight: 500, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    },
  )
}
