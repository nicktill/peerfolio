import Image from "next/image"
import type React from "react"

/** A phone frame with a status bar and home indicator. The screen is a flex column so a browser bar sits above or below the page. */
export function Phone({ children, android }: { children: React.ReactNode; android?: boolean }) {
  return (
    <div className={android ? "ig-phone ig-android" : "ig-phone"} aria-hidden>
      <span className="ig-btn ig-btn-a" />
      <span className="ig-btn ig-btn-b" />
      <span className="ig-btn ig-btn-c" />
      <div className="ig-screen">
        <div className="ig-status">
          <span className="ig-time">9:41</span>
          <span className="ig-sys">
            <svg width="13" height="8" viewBox="0 0 16 10" fill="currentColor"><rect x="0" y="6" width="3" height="4" rx="0.8" /><rect x="4.3" y="4" width="3" height="6" rx="0.8" /><rect x="8.6" y="2" width="3" height="8" rx="0.8" /><rect x="12.9" y="0" width="3" height="10" rx="0.8" /></svg>
            <svg width="12" height="9" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 3.6a8.5 8.5 0 0 1 12 0" /><path d="M3.2 6a5.4 5.4 0 0 1 7.6 0" /><circle cx="7" cy="8.4" r="0.9" fill="currentColor" stroke="none" /></svg>
            <svg width="20" height="9" viewBox="0 0 24 11" fill="none"><rect x="0.5" y="0.5" width="20" height="10" rx="3" stroke="currentColor" opacity="0.45" /><rect x="2" y="2" width="15" height="7" rx="1.6" fill="currentColor" /><path d="M22 3.8v3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" /></svg>
          </span>
        </div>
        <div className="ig-island" />
        {children}
        <span className="ig-homebar" />
      </div>
    </div>
  )
}

/**
 * Marks the thing to tap: a steady ring with a soft halo, and a translucent fingertip that glides in, presses
 * and lifts on a slow loop. Nothing blinks; transform and opacity only, and it holds still under reduced motion.
 */
export function Pulse() {
  return (
    <span className="ig-pulse" aria-hidden>
      <i className="ig-touch" />
    </span>
  )
}

export function Step({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <figure className="ig-step">
      {children}
      <figcaption>
        <span className="ig-n">{n}</span>
        <span className="ig-t">{title}</span>
        <span className="ig-b">{body}</span>
      </figcaption>
    </figure>
  )
}

/**
 * A real capture of the app (390px wide, the actual mobile layout), in both themes; CSS shows the one that matches.
 * Each size is captured to fill its slot exactly, so the app's own tab bar always sits flush above the browser bar:
 * "bottom" fits under a bottom-bar browser (Safari, Samsung Internet), "top" under a top-bar one (Chrome, Firefox),
 * "standalone" is the full-screen installed app.
 */
export function Shot({ kind, dim }: { kind: "bottom" | "top" | "standalone"; dim?: boolean }) {
  const h = kind === "bottom" ? 663 : kind === "top" ? 718 : 846
  return (
    <div className={`ig-shot ig-shot-${kind}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ig-img-light" src={`/install/${kind}-light.jpg`} alt="" width={780} height={h * 2} decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ig-img-dark" src={`/install/${kind}-dark.jpg`} alt="" width={780} height={h * 2} decoding="async" />
      {dim && <span className="ig-dim" />}
    </div>
  )
}

const FILLER = ["#8aa4c8", "#c9a36b", "#7fae95", "#b88aa8", "#8d8fb8", "#c78a80", "#7ba7b3", "#a8b07a", "#9c8f7e", "#6f86a3", "#b99c6f"]

export function HomeScreen() {
  const cells = [...FILLER.slice(0, 5), "peerfolio", ...FILLER.slice(5)]
  return (
    <div className="ig-home">
      <span className="ig-clock">Friday, October 23</span>
      <div className="ig-grid">
        {cells.map((c, i) =>
          c === "peerfolio" ? (
            <span key={i} className="ig-cell ig-cell-pf">
              <Image src="/icons/icon-192.png" alt="" width={40} height={40} className="ig-pficon" />
              <i>Peerfolio</i>
              <Pulse />
            </span>
          ) : (
            <span key={i} className="ig-cell"><span className="ig-fake" style={{ background: c }} /><i /></span>
          ),
        )}
      </div>
    </div>
  )
}
